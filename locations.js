export function validateLocation(value){
 if(!value||!Number.isFinite(value.latitude)||Math.abs(value.latitude)>90||!Number.isFinite(value.longitude)||Math.abs(value.longitude)>180||typeof value.address!=='string'||!value.address.trim()||value.address.length>500||typeof value.hasDriver!=='boolean')throw Object.assign(new Error('Enter a valid family location and choose whether you have a driver'),{status:400});
 return {...value,address:value.address.trim()};
}
