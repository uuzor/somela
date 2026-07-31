import { ArrowLeft, Sparkles } from "lucide-react";
export default function ComparisonView({ products, onBack, onTry }) {
  return (
    <div className="p-6 overflow-y-auto h-full max-w-5xl mx-auto">
      <button onClick={onBack} className="control mb-5">
        <ArrowLeft size={15} />
        Results
      </button>
      <h1 className="text-2xl font-semibold mb-5">Compare your shortlist</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {products.slice(0, 3).map((p) => (
          <article key={p.id} className="panel overflow-hidden">
            <img
              src={p.image}
              alt={p.name}
              className="w-full h-60 object-cover"
            />
            <div className="p-5">
              <h2 className="font-medium">{p.name}</h2>
              <p className="text-sm text-muted-foreground">
                {p.merchant} · ${p.price}
              </p>
              <dl className="text-xs mt-4 space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Visual match</dt>
                  <dd>{p.match}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Available</dt>
                  <dd className="text-emerald-500">In stock</dd>
                </div>
              </dl>
              <button onClick={() => onTry(p)} className="primary w-full mt-5">
                <Sparkles size={15} />
                Try this on
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
