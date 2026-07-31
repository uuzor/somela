import { Heart, Sparkles, Check } from "lucide-react";

export default function ProductCard({ product, selected, onSelect, onTry, loading = false }) {
  return (
    <article className={`group rounded-[16px] overflow-hidden bg-card transition ${selected ? 'ring-0 ring-primary' : 'shadow-elevated'}`}>
      <button
        onClick={onSelect}
        disabled={loading || !product}
        className="relative block w-full text-left p-2"
      >
        {loading ? (
          <div className="w-full aspect-[4/3] object-cover rounded-[20px] bg-muted animate-pulse" />
        ) : (
          <>
            <img src={product.images[0]} alt={product.title} className="w-full aspect-[4/3] object-cover rounded-[20px]" />
            <span className="absolute left-4 bottom-4 badge">{product.category}</span>
            {selected && (
              <span className="absolute top-4 left-4 bg-primary rounded-full p-1">
                <Check size={14} />
              </span>
            )}
            <Heart className="absolute top-4 right-4 text-foreground" size={16} />
          </>
        )}
      </button>
      <div className="px-3 pb-3">
        {loading ? (
          <>
            <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
            <div className="mt-2 h-2 w-1/2 rounded bg-muted animate-pulse" />
            <div className="flex mt-2 text-xs items-center">
              <span className="h-3 w-12 rounded bg-muted animate-pulse" />
              <span className="ml-auto h-3 w-14 rounded bg-muted animate-pulse" />
            </div>
          </>
        ) : (
          <>
            <h3 className="text-xs font-medium truncate tracking-tight-xs">{product.name}</h3>
            <p className="text-[10px] text-muted-foreground">{product.merchant}</p>
            <div className="flex mt-1.5 text-xs items-center">
              <span className="font-medium">${product.minPrice}</span>
              <button onClick={onTry} disabled={!product.available} className="ml-auto text-primary flex gap-1 disabled:text-muted-foreground">
                <Sparkles size={12} />Try on
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}




// : 
// category
// : 
// "bottom"
// images
// : 
// (5) ['https://cdn.shopify.com/s/files/1/0007/0051/4360/f…cde9-0360-4dc1-8262-37b8638d64c4.jpg?v=1768332798', 'https://cdn.shopify.com/s/files/1/0007/0051/4360/files/COGEW-H08431BAA_01.jpg?v=1727471657', 'https://cdn.shopify.com/s/files/1/0007/0051/4360/files/COGEW-H08431BAA_03.jpg?v=1768331542', 'https://cdn.shopify.com/s/files/1/0007/0051/4360/files/COGEW-H08431BAA_04.jpg?v=1768331542', 'https://cdn.shopify.com/s/files/1/0007/0051/4360/files/COGEW-H08431BAA_05.jpg?v=1768331542']
// maxPrice
// : 
// 197.5
// minPrice
// : 
// 197.5
// productId
// : 
// "apc-us:6901933801571"
// title
// : 
// "Ville Chinos"
// url
// : 
// "https://www.apc-us.com/products/chino-ville-cogew-h08431"