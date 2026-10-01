import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res){
  const id=String(req.query?.id||"");
  if(!id)return res.status(400).json({error:"Order id required."});
  const r=await db.query("SELECT id,status,payment,payment_status,total,created_at FROM orders WHERE id=$1",[id]);
  if(!r.rows.length)return res.status(404).json({error:"Order not found."});
  res.json(r.rows[0]);
}