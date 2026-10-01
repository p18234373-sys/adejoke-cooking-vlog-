import { db, config } from "hatchable";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const {order_id,email}=req.body||{};
  if(!order_id||!email)return res.status(400).json({error:"Order and email are required."});
  const key=await config.get("PAYSTACK_SECRET_KEY");
  if(!key)return res.status(503).json({error:"Online payment is not configured yet."});
  const r=await db.query("SELECT id,total,status,payment_status FROM orders WHERE id=$1",[order_id]);
  if(!r.rows.length)return res.status(404).json({error:"Order not found."});
  const order=r.rows[0];
  if(order.status!=="Accepted")return res.status(409).json({error:"The restaurant must accept your order before payment can be made."});
  if(order.payment_status==="paid")return res.json({paid:true});
  const reference="ACV-"+String(order.id).replace(/-/g,"")+"-"+Date.now();
  const resp=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({email,amount:Math.round(Number(order.total)*100),currency:"NGN",reference,metadata:{order_id:String(order.id)}})});
  const data=await resp.json();
  if(!resp.ok||!data.status)return res.status(502).json({error:data.message||"Could not start payment."});
  await db.query("UPDATE orders SET payment_status='pending',payment_reference=$1,payment='Pay online (Paystack)' WHERE id=$2",[data.data.reference,order.id]);
  res.json({authorization_url:data.data.authorization_url,reference:data.data.reference});
}