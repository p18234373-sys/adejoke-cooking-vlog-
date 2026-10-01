import { db, auth } from "hatchable";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res){
  const user=await auth.getUser(req);
  if(!user)return res.status(401).json({error:"Please sign in.",login:true});
  const r=await db.query("SELECT email FROM restaurant_admins WHERE email=$1 AND active=TRUE",[String(user.email).toLowerCase()]);
  res.json({ok:r.rows.length>0,email:user.email,name:user.name||""});
}