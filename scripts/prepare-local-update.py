#!/usr/bin/env python3
"""Keep a single verified, compressed local update; never launch or replace a running app."""
from pathlib import Path
import argparse,os,subprocess,shutil,tarfile,tempfile,json
root=Path(__file__).resolve().parent.parent
archive=root/'work/pending-update.tar.gz'
p=argparse.ArgumentParser();p.add_argument('source',nargs='?');p.add_argument('--install',action='store_true');args=p.parse_args()
if args.install:
    processes=subprocess.check_output(['ps','-axo','comm'],text=True)
    if '/Applications/ryxnontop.app/Contents/MacOS/ryxnontop' in processes:raise SystemExit('Quit ryxnontop before applying the prepared update. It will not be opened automatically.')
    if not archive.exists():raise SystemExit('No prepared update found.')
    with tempfile.TemporaryDirectory(prefix='update-',dir=root/'work') as stage:
        with tarfile.open(archive) as tar:
            # BSD tar stores macOS metadata as AppleDouble sidecars; those are not bundle files.
            members=[m for m in tar.getmembers() if not any(part.startswith('._') for part in Path(m.name).parts)]
            tar.extractall(stage,members=members,filter='data')
        subprocess.run(['python3',str(root/'scripts/install-local.py'),str(Path(stage)/'ryxnontop.app')],check=True)
    archive.unlink()
else:
    if not args.source:raise SystemExit('Provide a verified packaged bundle.')
    source=Path(args.source).resolve()
    if source.parent!=root/'work/release/mac-arm64' or source.name!='ryxnontop.app':raise SystemExit('Only the known local staging bundle can be prepared.')
    temporary=archive.with_suffix('.tmp')
    subprocess.run(['/usr/bin/tar','-czf',str(temporary),'-C',str(source.parent),source.name],check=True,env={**os.environ,'GZIP':'-1','COPYFILE_DISABLE':'1'})
    with tarfile.open(temporary) as tar:
        if 'ryxnontop.app/Contents/Info.plist' not in tar.getnames():raise SystemExit('Prepared update verification failed.')
    temporary.replace(archive)
    shutil.rmtree(source)
    print(json.dumps({'prepared':str(archive),'installed_app':'left running unchanged','automatic_launch':False}))
