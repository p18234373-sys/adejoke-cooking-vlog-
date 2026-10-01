import { db, config, webhooks } from "hatchable";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const secret=await config.get("PAYSTACK_SECRET_KEY");
  if(!secret)return res.status(200).json({ok:true});
  const signature=req.headers["x-paystack-signature"]||"";
  const valid=await webhooks.verifyHmac({raw:req.rawBody,signature,secret,algorithm:"sha512",encoding:"hex",tolerance:0});
  if(!valid)return res.status(401).json({error:"Invalid signature."});
  const ev=req.body||{};
  if(ev.event==="charge.success"){
    const ref=ev.data?.reference;
    const amount=Number(ev.data?.amount||0);
    if(ref){
      const r=await db.query("SELECT id,total FROM orders WHERE payment_reference=$1",[ref]);
      if(r.rows.length&&Math.round(Number(r.rows[0].total)*100)===amount)await db.query("UPDATE orders SET payment_status='paid' WHERE id=$1",[r.rows[0].id]);
    }
  }
  res.status(200).json({ok:true});
}