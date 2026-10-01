import { db, auth } from "hatchable";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res){
  const user=await auth.getUser(req);
  if(!user)return res.status(401).json({error:"Please sign in.",login:true});
  const email=String(user.email||"").toLowerCase();
  const a=await db.query("SELECT email FROM restaurant_admins WHERE email=$1 AND active=TRUE",[email]);
  if(!a.rows.length)return res.status(403).json({error:"You are not an approved restaurant admin."});
  const r=await db.query("SELECT id,customer_name,phone,method,address,notes,items,subtotal,delivery,total,payment,payment_status,payment_reference,status,created_at FROM orders ORDER BY created_at DESC LIMIT 100");
  res.json({orders:r.rows,email:user.email,name:user.name||""});
}