import { db, auth } from "hatchable";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const user=await auth.getUser(req); if(!user)return res.status(401).json({error:"Please sign in."});
  const email=String(user.email||"").toLowerCase();
  const a=await db.query("SELECT email FROM restaurant_admins WHERE email=$1 AND active=TRUE",[email]);
  if(!a.rows.length)return res.status(403).json({error:"Not authorized."});
  const id=String(req.body?.id||"");
  const status=String(req.body?.status||"");
  const allowed=["Pending","Accepted","Rejected","Preparing","Ready","Out for delivery","Completed"];
  if(!id||!allowed.includes(status))return res.status(400).json({error:"Invalid order update."});
  const r=await db.query("UPDATE orders SET status=$1 WHERE id=$2 RETURNING id,status",[status,id]);
  if(!r.rows.length)return res.status(404).json({error:"Order not found."});
  res.json({ok:true,order:r.rows[0]});
}