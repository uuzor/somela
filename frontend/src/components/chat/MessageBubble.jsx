import React from "react";
import { Sparkles } from "lucide-react";
import ProductWidget from "@/components/chat/ProductWidget";

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-gray-100 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%]">
          {message.imageUrl && (
            <img 
              src={message.imageUrl} 
              alt="" 
              className="w-28 h-28 rounded-lg object-cover mb-2" 
            />
          )}
          <p className="text-[14px] font-medium text-gray-800 leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
      </div>
      <div className="max-w-[80%]">
        <p className="text-[14px] font-medium text-gray-800 leading-relaxed mb-1 whitespace-pre-wrap">
          {message.content}
        </p>
        {message.products && message.products.length > 0 && (
          <ProductWidget products={message.products} />
        )}
      </div>
    </div>
  );
}