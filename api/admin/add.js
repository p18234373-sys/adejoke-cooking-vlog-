import { db, admin } from "hatchable";
export const access = "admin";
export const methods = ["POST"];
export default async function(req,res){
  const allowed=await admin.require(req,res); if(!allowed)return;
  const email=String(req.body?.email||"").trim().toLowerCase();
  if(!email||!email.includes("@"))return res.status(400).json({error:"Enter a valid email address."});
  await db.query("INSERT INTO restaurant_admins (email,active) VALUES ($1,TRUE) ON CONFLICT (email) DO UPDATE SET active=TRUE",[email]);
  res.json({ok:true,email});
}