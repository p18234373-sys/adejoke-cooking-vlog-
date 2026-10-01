import { db, config } from "hatchable";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res){
  const reference=String(req.query?.reference||"");
  if(!reference)return res.status(400).json({error:"Reference required."});
  const key=await config.get("PAYSTACK_SECRET_KEY");
  if(!key)return res.status(503).json({error:"Payment is not configured."});
  const resp=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{"Authorization":"Bearer "+key}});
  const data=await resp.json();
  if(!resp.ok||!data.status)return res.status(502).json({error:data.message||"Could not verify payment."});
  const tx=data.data;
  const orderId=tx.metadata?.order_id;
  if(!orderId)return res.status(400).json({error:"Payment has no order reference."});
  const r=await db.query("SELECT id,total FROM orders WHERE id=$1",[orderId]);
  if(!r.rows.length)return res.status(404).json({error:"Order not found."});
  const expected=Math.round(Number(r.rows[0].total)*100);
  if(tx.currency!=="NGN"||Number(tx.amount)!==expected)return res.status(400).json({error:"Payment amount does not match the order."});
  const paid=tx.status==="success";
  await db.query("UPDATE orders SET payment_status=$1 WHERE id=$2",[paid?"paid":"failed",orderId]);
  res.json({paid,order_id:orderId,status:tx.status});
}