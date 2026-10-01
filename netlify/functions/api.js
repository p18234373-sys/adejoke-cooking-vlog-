const express=require("express");
const serverless=require("serverless-http");
const crypto=require("crypto");
const {Pool}=require("pg");
const {getConnectionString}=require("@netlify/database");

const app=express();
app.use(express.json({verify:(req,res,buf)=>{req.rawBody=buf}}));

let pool;
function db(){if(!pool)pool=new Pool({connectionString:getConnectionString(),max:3});return pool}
function json(res,data,status=200){return res.status(status).json(data)}
function cookies(req){return Object.fromEntries((req.headers.cookie||"").split(";").filter(Boolean).map(x=>{const i=x.indexOf("=");return [x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))]}))}
function sign(value){return crypto.createHmac("sha256",process.env.ADMIN_PASSWORD||"").update(value).digest("hex")}
function token(email){const raw=email+"|"+Date.now();return Buffer.from(raw+"|"+sign(raw)).toString("base64url")}
function adminEmail(req){
  const t=cookies(req).admin_token;if(!t)return null;
  try{const raw=Buffer.from(t,"base64url").toString();const p=raw.split("|");if(p.length<3)return null;
    const email=p[0],sig=p[p.length-1],body=p.slice(0,-1).join("|");
    if(!process.env.ADMIN_PASSWORD||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(sign(body))))return null;
    if(Date.now()-Number(p[1])>1000*60*60*24*30)return null; return email.toLowerCase();
  }catch{return null}
}
async function isAdmin(email){
  if(!email)return false;
  const configured=(process.env.ADMIN_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(configured.includes(email))return true;
  const r=await db().query("SELECT 1 FROM restaurant_admins WHERE email=$1 AND active=TRUE",[email]);return !!r.rowCount;
}

app.post("/api/order",async(req,res)=>{
  try{
    const o=req.body||{};
    if(!o.customer||!o.phone||!o.email||!Array.isArray(o.items)||!o.items.length)return json(res,{error:"Missing order details"},400);
    const subtotal=Number(o.subtotal)||0,delivery=Number(o.delivery)||0,total=Number(o.total)||subtotal+delivery;
    const r=await db().query("INSERT INTO orders(customer_name,phone,email,method,address,notes,items,subtotal,delivery,total,payment,status) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,'Pending') RETURNING id,status,created_at",
      [o.customer,o.phone,o.email,o.method||"Delivery",o.address||"",o.notes||"",JSON.stringify(o.items),subtotal,delivery,total,o.payment||"Cash on delivery / pickup"]);
    return json(res,r.rows[0]);
  }catch(e){console.error(e);return json(res,{error:"Could not place order."},500)}
});

app.get("/api/order/status",async(req,res)=>{
  try{const id=String(req.query.id||"");if(!id)return json(res,{error:"Order id required."},400);
    const r=await db().query("SELECT id,status,payment,payment_status,total,created_at FROM orders WHERE id=$1",[id]);
    return r.rowCount?json(res,r.rows[0]):json(res,{error:"Order not found."},404);
  }catch(e){return json(res,{error:"Could not load order."},500)}
});

app.post("/api/admin/login",async(req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");
  if(!email||!password||!process.env.ADMIN_PASSWORD)return json(res,{error:"Admin login is not configured yet."},503);
  const ok=password===process.env.ADMIN_PASSWORD && await isAdmin(email);
  if(!ok)return json(res,{error:"Invalid admin email or password."},401);
  res.setHeader("Set-Cookie",`admin_token=${token(email)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
  return json(res,{ok:true,email});
});

app.post("/api/admin/logout",async(req,res)=>{res.setHeader("Set-Cookie","admin_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");return json(res,{ok:true})});
app.get("/api/admin/me",async(req,res)=>{const email=adminEmail(req);if(!email||!(await isAdmin(email)))return json(res,{ok:false},401);return json(res,{ok:true,email})});

app.get("/api/admin/orders",async(req,res)=>{
  const email=adminEmail(req);if(!email||!(await isAdmin(email)))return json(res,{error:"Please sign in."},401);
  try{const r=await db().query("SELECT id,customer_name,phone,email,method,address,notes,items,subtotal,delivery,total,payment,payment_status,payment_reference,status,created_at FROM orders ORDER BY created_at DESC LIMIT 100");return json(res,{orders:r.rows,email})}
  catch(e){return json(res,{error:"Could not load orders."},500)}
});

app.post("/api/admin/update-order",async(req,res)=>{
  const email=adminEmail(req);if(!email||!(await isAdmin(email)))return json(res,{error:"Not authorized."},401);
  const id=String(req.body?.id||""),status=String(req.body?.status||"");
  const allowed=["Pending","Accepted","Rejected","Preparing","Ready","Out for delivery","Completed"];
  if(!id||!allowed.includes(status))return json(res,{error:"Invalid order update."},400);
  const r=await db().query("UPDATE orders SET status=$1 WHERE id=$2 RETURNING id,status",[status,id]);
  return r.rowCount?json(res,{ok:true,order:r.rows[0]}):json(res,{error:"Order not found."},404);
});

app.post("/api/admin/add",async(req,res)=>{
  const email=adminEmail(req),configured=(process.env.ADMIN_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!email||!configured.includes(email))return json(res,{error:"Owner access required."},403);
  const add=String(req.body?.email||"").trim().toLowerCase();
  if(!add.includes("@"))return json(res,{error:"Enter a valid email address."},400);
  await db().query("INSERT INTO restaurant_admins(email,active) VALUES($1,TRUE) ON CONFLICT(email) DO UPDATE SET active=TRUE",[add]);
  return json(res,{ok:true,email:add});
});

app.post("/api/pay/initialize",async(req,res)=>{
  try{
    const {order_id,email}=req.body||{};if(!order_id||!email)return json(res,{error:"Order and email are required."},400);
    const key=process.env.PAYSTACK_SECRET_KEY;if(!key)return json(res,{error:"Online payment is not configured yet."},503);
    const r=await db().query("SELECT id,email,total,status,payment_status FROM orders WHERE id=$1",[order_id]);if(!r.rowCount)return json(res,{error:"Order not found."},404);
    const o=r.rows[0];if(o.status!=="Accepted")return json(res,{error:"The restaurant must accept your order before payment can be made."},409);
    if(o.payment_status==="paid")return json(res,{paid:true});
    const reference="ACV-"+String(o.id).replace(/-/g,"")+"-"+Date.now();
    const resp=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({email,amount:Math.round(Number(o.total)*100),currency:"NGN",reference,metadata:{order_id:String(o.id)}})});
    const data=await resp.json();if(!resp.ok||!data.status)return json(res,{error:data.message||"Could not start payment."},502);
    await db().query("UPDATE orders SET payment_status='pending',payment_reference=$1,payment='Pay online (Paystack)' WHERE id=$2",[data.data.reference,o.id]);
    return json(res,{authorization_url:data.data.authorization_url,reference:data.data.reference});
  }catch(e){console.error(e);return json(res,{error:"Could not start payment."},500)}
});

app.get("/api/pay/verify",async(req,res)=>{
  try{
    const reference=String(req.query.reference||"");if(!reference)return json(res,{error:"Reference required."},400);
    const key=process.env.PAYSTACK_SECRET_KEY;if(!key)return json(res,{error:"Payment is not configured."},503);
    const resp=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+key}});
    const data=await resp.json();if(!resp.ok||!data.status)return json(res,{error:data.message||"Could not verify payment."},502);
    const tx=data.data,orderId=tx.metadata?.order_id;if(!orderId)return json(res,{error:"Payment has no order reference."},400);
    const r=await db().query("SELECT id,total FROM orders WHERE id=$1",[orderId]);if(!r.rowCount)return json(res,{error:"Order not found."},404);
    const paid=tx.currency==="NGN"&&Number(tx.amount)===Math.round(Number(r.rows[0].total)*100)&&tx.status==="success";
    await db().query("UPDATE orders SET payment_status=$1 WHERE id=$2",[paid?"paid":"failed",orderId]);
    return json(res,{paid,order_id:orderId,status:tx.status});
  }catch(e){return json(res,{error:"Could not verify payment."},500)}
});

app.post("/api/pay/webhook",async(req,res)=>{
  const key=process.env.PAYSTACK_SECRET_KEY;if(!key)return json(res,{ok:true});
  const sig=req.headers["x-paystack-signature"]||"",expected=crypto.createHmac("sha512",key).update(req.rawBody||"").digest("hex");
  if(sig!==expected)return json(res,{error:"Invalid signature."},401);
  try{const ev=req.body||{};if(ev.event==="charge.success"){const ref=ev.data?.reference,amount=Number(ev.data?.amount||0);if(ref){const r=await db().query("SELECT id,total FROM orders WHERE payment_reference=$1",[ref]);if(r.rowCount&&Math.round(Number(r.rows[0].total)*100)===amount)await db().query("UPDATE orders SET payment_status='paid' WHERE id=$1",[r.rows[0].id])}}return json(res,{ok:true})}
  catch(e){return json(res,{ok:true})}
});

module.exports={handler:serverless(app)};
