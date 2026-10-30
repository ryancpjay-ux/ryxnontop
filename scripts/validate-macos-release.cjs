const {version}=require('../package.json');
if(process.env.RELEASE_TAG!==`v${version}`)throw Error('Mac release tag must match package.json.');
for(const name of ['CSC_LINK','CSC_KEY_PASSWORD','APPLE_API_KEY_BASE64','APPLE_API_KEY_ID','APPLE_API_ISSUER','APPLE_TEAM_ID'])if(!process.env[name])throw Error(`Mac production release requires ${name}. No unsigned production fallback is allowed.`);
if(!/^[A-Z0-9]{10}$/.test(process.env.APPLE_TEAM_ID))throw Error('Expected Apple Developer Team ID.');
console.log('Mac release inputs are present; signing/notarization must still succeed.');
