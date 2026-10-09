import type {RequestHandler, ErrorRequestHandler} from 'express';
export const sameOriginWrites:RequestHandler=(req,res,next)=>{
 res.set({'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  const expected=process.env.APP_URL||req.protocol+'://'+req.get('host');
  if(req.get('X-Loreworks')!=='1'||(req.get('origin')&&req.get('origin')!==expected)){
   res.status(403).json({error:'Request origin could not be verified.'});return;
  }
 }
 next();
};
export const apiErrors:ErrorRequestHandler=(error,_req,res,_next)=>{
 const status=Number(error.status)||500;
 if(status>=500)console.error('[API]',error);
 res.status(status).json({error:status>=500?'The request could not be completed. Please retry.':error.message});
};
export function rateLimit(max=180,windowMs=60000):RequestHandler{
 const requests=new Map<string,{count:number,until:number}>();
 return(req,res,next)=>{
  const now=Date.now();for(const [key,value]of requests)if(value.until<now)requests.delete(key);
  const key=req.ip||'unknown',entry=requests.get(key)||{count:0,until:now+windowMs};
  if(++entry.count>max||requests.size>10000){res.set('Retry-After','60').status(429).json({error:'Please slow down and retry shortly.'});return;}
  requests.set(key,entry);next();
 };
}
