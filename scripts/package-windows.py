"""Verify a Windows PE x64 runtime and package only its application folder."""
from pathlib import Path
import hashlib,json,struct,zipfile,shutil,os
root=Path(__file__).resolve().parent.parent
source=root/'work/windows/win-unpacked'
exe=source/'ryxnontop.exe'
with exe.open('rb') as stream:
 if stream.read(2)!=b'MZ':raise SystemExit('Missing Windows executable')
 stream.seek(0x3c); offset=struct.unpack('<I',stream.read(4))[0];stream.seek(offset)
 if stream.read(4)!=b'PE\0\0' or struct.unpack('<H',stream.read(2))[0]!=0x8664:raise SystemExit('Expected an x64 PE executable')
for required in ['resources/app.asar','ffmpeg.dll','icudtl.dat']:
 if not (source/required).is_file():raise SystemExit('Incomplete Windows runtime: '+required)
readme=r'''ryxnontop for Windows (x64)

1. Extract this entire ZIP into a short folder such as C:\Apps. The application is in the ryxnontop folder.
2. Open ryxnontop.exe inside that folder. Keep the other files beside it.
3. Enter the workspace and follow the first-launch API setup wizard.
   Choose OpenAI, Gemini, or Claude for answers, then configure Deepgram for Listen.
   Change individual keys later in Settings > API Connections.

API keys are not included. Each person uses their own accounts and API billing.
Settings and keys are saved under your Windows user profile, separately from this folder.
Keys use Electron safeStorage (Windows DPAPI).

Choose System Audio to transcribe PC playback, or Microphone for your voice.
If microphone access fails, open Windows Settings > Privacy & security > Microphone
and allow desktop applications to use the microphone.
Screen preview stays local; a fresh screenshot is sent only when Ask uses Screen on.

Shortcuts: Ctrl+Shift+H hide/show, Ctrl+Shift+1 screenshot, Ctrl+Enter answer.
No standard running-app taskbar button is used. Open the tray icon/menu or press
Ctrl+Shift+H to restore a hidden/minimized window. Opening the app from Start also
restores the running instance. X or the tray Quit command quits the application.
Windows capture exclusion is requested through native APIs, but compatibility
with your screenshot/sharing tool must be checked. The tray icon and native OS
menus are separate Windows UI and may still appear in captures.

This is an unsigned test build. It has been cross-built and package-verified on macOS;
a Windows runtime/audio test is still required. It is not a notarized or publisher-signed release.
Do not assume screen-capture protection works with every recording program.

Support: Instagram @ryan.c.jay | ryancpjay@gmail.com
'''
(source/'START-HERE.txt').write_text(readme)
shutil.copyfile(root/'LICENSE',source/'LICENSE-APP.txt')
out=Path(os.environ.get('RYX_WINDOWS_OUTPUT_DIR',str(root.parent/'windows')));out.mkdir(parents=True,exist_ok=True)
version=json.loads((root/'package.json').read_text())['version']
archive=out/f'ryxnontop-{version}-Windows-x64-fixed.zip';temporary=archive.with_suffix('.tmp')
files=[]
with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
 for file in sorted(source.rglob('*')):
  if file.is_symlink():raise SystemExit('Unexpected symlink in Windows runtime: '+str(file.relative_to(source)))
  if file.is_file():
   name='ryxnontop/'+file.relative_to(source).as_posix()
   if len(name)>160:raise SystemExit('Windows extraction path exceeds the package budget: '+name)
   z.write(file,name);files.append(name)
with zipfile.ZipFile(temporary) as z:
 bad=z.testzip()
 if bad:raise SystemExit('Corrupt ZIP member: '+bad)
 if any(name.endswith(('provider-keys.enc','workspace.json','.env')) for name in z.namelist()):raise SystemExit('Unexpected user data in archive')
temporary.replace(archive)
digest=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
(out/(archive.name+'.sha256')).write_text(digest+'  '+archive.name+'\n')
(out/'START-HERE.txt').write_text('''ryxnontop for Windows

RECOMMENDED: Open ryxnontop-'''+version+'''-Windows-Setup.exe.
Follow the installer, then open ryxnontop from your desktop or Start menu.
The supporting files are managed inside the installation folder.
You only need to send the Setup.exe file to another Windows user.
This test installer is unsigned and still needs a Windows runtime test.

PORTABLE ZIP (optional, no installation):
'''+readme)
shutil.rmtree(source)
print(json.dumps({'archive':str(archive),'files_verified':len(files),'sha256':digest,'runtime_test':'requires Windows'}))
