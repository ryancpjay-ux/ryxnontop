#!/usr/bin/env python3
"""Replace one canonical installation; keep temporary bundles out of Applications."""
from pathlib import Path
import argparse, json, os, plistlib, re, shutil, subprocess

root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('source');args=parser.parse_args()
source=Path(args.source).resolve();destination=Path('/Applications/ryxnontop.app')
stage=Path('/Applications/.ryxnontop-update')
backup=root/'work'/'previous-install'
identifier='com.local.mistcopilot'
def app_info(bundle):
    try:
        with (bundle/'Contents/Info.plist').open('rb') as stream:return plistlib.load(stream)
    except (OSError,plistlib.InvalidFileException):return {}
def version(value):return tuple(int(n) for n in re.findall(r'\d+',str(value))[:3])
if app_info(source).get('CFBundleIdentifier')!=identifier:raise SystemExit('Not a ryxnontop build')
if source==destination:raise SystemExit('Source must be a temporary build')
processes=subprocess.check_output(['ps','-axo','pid,comm'],text=True)
if any(line.strip().endswith('/Applications/ryxnontop.app/Contents/MacOS/ryxnontop') for line in processes.splitlines()):raise SystemExit('Quit ryxnontop first so its data can be saved before updating.')
if destination.exists() and version(app_info(source).get('CFBundleShortVersionString'))<version(app_info(destination).get('CFBundleShortVersionString')):raise SystemExit('Refusing to replace a newer installed version')
if stage.exists():shutil.rmtree(stage)
shutil.copytree(source,stage,symlinks=True)
signing_settings=Path.home()/'Library/Application Support/ryxnontop-build/signing.json'
if not signing_settings.exists():raise SystemExit('Finish the approved local signing setup before installing another update.')
identity=json.loads(signing_settings.read_text())['identity']
if not re.fullmatch(r'[A-Fa-f0-9]{40}',identity):raise SystemExit('Invalid signing identity configuration')
subprocess.run(['codesign','--force','--deep','--sign',identity,'--options','runtime','--timestamp=none','--entitlements',str(root/'build/entitlements.mac.plist'),str(stage)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(stage)],check=True)
# Re-check the copied archive, rather than trusting a copy/signing exit status.
subprocess.run(['node','-e',"const a=require('@electron/asar');const p=JSON.parse(a.extractFile(process.argv[1],'package.json'));if(p.main!=='electron/main.js')process.exit(1)",str(stage/'Contents/Resources/app.asar')],cwd=root,check=True)
backup.parent.mkdir(exist_ok=True)
if backup.exists():shutil.rmtree(backup)
if destination.exists():destination.rename(backup)
try:stage.rename(destination)
except Exception:
    if backup.exists():backup.rename(destination)
    raise
# Keep one recoverable rollback archive, without loose nested helper apps for Finder to index.
if backup.exists():
    archive=root/'work'/'previous-install.tar.gz'
    temporary=root/'work'/'previous-install.tar.gz.tmp'
    subprocess.run(['/usr/bin/tar','-czf',str(temporary),'-C',str(backup.parent),backup.name],check=True,env={**os.environ,'GZIP':'-1','COPYFILE_DISABLE':'1'})
    temporary.replace(archive)
    shutil.rmtree(backup)
# Only this app's generated bundles are disposable; source/user profiles stay untouched.
for directory in [Path('/Applications'),Path.home()/'Applications']:
    if directory.exists():
        for candidate in directory.glob('*.app'):
            if candidate!=destination and app_info(candidate).get('CFBundleIdentifier')==identifier:shutil.rmtree(candidate)
for directory in [root/'dist',root/'work/release']:
    if directory.exists():
        for candidate in list(directory.rglob('ryxnontop.app')):
            if candidate.exists() and app_info(candidate).get('CFBundleIdentifier')==identifier:shutil.rmtree(candidate)
if source.exists() and source!=destination and app_info(source).get('CFBundleIdentifier')==identifier:shutil.rmtree(source)
print(json.dumps({'installed':str(destination),'version':app_info(destination).get('CFBundleShortVersionString'),'profile':'preserved','generated_app_bundles':'cleaned'}))
