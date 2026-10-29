#!/usr/bin/env python3
"""One-time, user-authorized local signing identity. No private key remains on disk."""
from pathlib import Path
import json,os,re,subprocess,tempfile
os.umask(0o077)
configuration=Path.home()/'Library/Application Support/ryxnontop-build'
configuration.mkdir(parents=True,exist_ok=True)
settings=configuration/'signing.json'
keychain=Path.home()/'Library/Keychains/login.keychain-db'
if settings.exists():
    saved=json.loads(settings.read_text())
    identities=subprocess.check_output(['security','find-identity','-p','codesigning',str(keychain)],text=True)
    if saved['identity'] in identities:
        print('Existing local signing identity retained.');raise SystemExit(0)
    raise SystemExit('Configured identity is missing; refusing to silently replace it.')
with tempfile.TemporaryDirectory(prefix='ryxnontop-signing-') as temporary:
    folder=Path(temporary);key=folder/'private.pem';certificate=folder/'certificate.pem';combined=folder/'identity.pem';config=folder/'openssl.cnf'
    config.write_text('''[req]\nprompt=no\ndistinguished_name=subject\nx509_extensions=extensions\n[subject]\nCN=ryxnontop Local Development\n[extensions]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=codeSigning\nsubjectKeyIdentifier=hash\n''')
    subprocess.run(['/usr/bin/openssl','req','-x509','-newkey','rsa:3072','-sha256','-nodes','-days','3650','-config',str(config),'-keyout',str(key),'-out',str(certificate)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    combined.write_bytes(certificate.read_bytes()+key.read_bytes());os.chmod(combined,0o600)
    subprocess.run(['security','import',str(combined),'-k',str(keychain),'-t','agg','-f','pemseq','-x','-T','/usr/bin/codesign'],check=True)
    # User-domain trust is restricted to code signing, never SSL or system roots.
    subprocess.run(['security','add-trusted-cert','-r','trustRoot','-p','codeSign','-k',str(keychain),str(certificate)],check=True)
    fingerprint=subprocess.check_output(['/usr/bin/openssl','x509','-in',str(certificate),'-noout','-fingerprint','-sha1'],text=True).split('=',1)[1].replace(':','').strip()
    if not re.fullmatch('[A-Fa-f0-9]{40}',fingerprint):raise SystemExit('Could not verify signing identity fingerprint')
    identities=subprocess.check_output(['security','find-identity','-v','-p','codesigning',str(keychain)],text=True)
    if fingerprint not in identities:raise SystemExit('Certificate imported but is not yet a valid signing identity. Review the Keychain prompt before retrying.')
    settings.write_text(json.dumps({'identity':fingerprint,'name':'ryxnontop Local Development','kind':'local-development','keychain':str(keychain)},indent=2)+'\n');os.chmod(settings,0o600)
print('Persistent local signing identity configured. Private key imported as non-extractable; temporary key files removed.')
