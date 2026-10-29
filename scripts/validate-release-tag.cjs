const version=require('../package.json').version;const tag=process.env.RELEASE_TAG||'';const stable=/^v\d+\.\d+\.\d+$/.test(tag);const test=/^v\d+\.\d+\.\d+-(?:alpha|beta|rc)\.\d+$/.test(tag);
if((!stable&&!test)||tag!==`v${version}`)throw Error('Release tag must be a semantic version matching package.json; test builds require -alpha.N, -beta.N or -rc.N.');
if(stable&&(!process.env.WIN_CSC_LINK||!process.env.RYX_WINDOWS_PUBLISHER||!process.env.WINDOWS_CERT_THUMBPRINT))throw Error('Stable Windows releases require signing credentials, publisher name and expected certificate thumbprint.');
if(process.env.GITHUB_OUTPUT)require('node:fs').appendFileSync(process.env.GITHUB_OUTPUT,`stable=${stable}\nversion=${version}\n`);
console.log(`Validated ${stable?'approved stable':'test'} release tag ${tag}`);
