export const IMG = [
  'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=85',
];
export const products = ['Cropped Leather Jacket','Wide Collar Crop Jacket','Cropped Moto Jacket','Boxy Crop Jacket','Cropped Biker Jacket','Cropped Faux Leather Jacket','Clean Crop Jacket','Waxed Crop Jacket'].map((name,i)=>({id:`p${i+1}`,name,merchant:['LuxeLine','Edge & Co.','Noir Avenue','Minimal State','Urban Theory','Daily Standard','Studio Black','Modern Archive'][i],price:[89,79,119,69,99,59,89,109][i],image:IMG[i%IMG.length],color:'Black',size:'M',match:i===0?'Closest match':'Similar silhouette',available:i!==6}));
export const cartSeed = [products[0],{...products[4],name:'Ribbed White Tank',price:32,color:'White'},{...products[1],name:'High-Rise Straight Jeans',price:74,color:'Mid Blue',size:'28',merchant:'Daily Standard'},{...products[6],name:'Minimal Leather Belt',price:36,merchant:'Daily Standard'},{...products[7],name:'Leather Ankle Boots',price:42,size:'39',merchant:'Noir Avenue'}].map((p,i)=>({...p,cartId:`c${i}`,qty:1}));
export const merchantNames=['LuxeLine','Daily Standard','Noir Avenue'];