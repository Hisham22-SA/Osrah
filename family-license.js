export function validateLicense(a){
 const bad=()=>{throw Object.assign(new Error('Enter family contact details and attach a valid PDF, PNG or JPEG license (up to 3 MB)'),{status:400});};
 if(!a||typeof a!=='object')bad();
 for(const key of ['phone','city','licenseNumber','licenseExpiry','filename','mime','document'])if(typeof a[key]!=='string')bad();
 if(!/^\+?\d{9,15}$/.test(a.phone)||!a.city.trim()||a.city.length>100||!a.licenseNumber.trim()||a.licenseNumber.length>100||a.filename.length>180||!a.filename.trim())bad();
 const date=new Date(a.licenseExpiry+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a.licenseExpiry)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==a.licenseExpiry||a.licenseExpiry<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date()))bad();
 if(a.document.length>4194304||!a.document.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(a.document))bad();
 const bytes=Buffer.from(a.document,'base64');if(bytes.length>3*1024*1024||bytes.toString('base64')!==a.document)bad();
 const valid=a.mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':a.mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):a.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:false;
 if(!valid)bad();return a;
}
