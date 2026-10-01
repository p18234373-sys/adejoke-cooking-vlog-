import { db } from "hatchable";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const o=req.body||{};
  if(!o.customer||!o.phone||!Array.isArray(o.items)||!o.items.length)return res.status(400).json({error:"Missing order details"});
  const subtotal=Number(o.subtotal)||Number(o.total)||0;
  const delivery=Number(o.delivery)||0;
  const total=Number(o.total)||subtotal+delivery;
  const r=await db.query(
    "INSERT INTO orders (customer_name,phone,method,address,notes,items,subtotal,delivery,total,payment,status) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING id,status,created_at",
    [o.customer,o.phone,o.method||"Delivery",o.address||"",o.notes||"",JSON.stringify(o.items),subtotal,delivery,total,o.payment||"Cash on delivery / pickup","Pending"]
  );
  res.json(r.rows[0]);
}