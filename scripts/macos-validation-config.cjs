// Build-only CI candidate. Never distributed and never installed over the production app.
const config=require('./macos-ci-config.cjs');
module.exports={...config,appId:'com.local.mistcopilot.test',productName:'ryxnontop Test',publish:null,forceCodeSigning:false,directories:{...config.directories,output:'work/macos-validation'},mac:{...config.mac,identity:null,notarize:false,target:[{target:'dir',arch:['arm64']}]}};
