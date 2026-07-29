import React, { useState } from "react";
import { Sparkles, Paperclip, Mic, ArrowUp, X, MoreHorizontal, PenLine } from "lucide-react";

const chatMessages = [
  {
    type: "user",
    text: "Can you give me outfit ideas using the hoodie I'm looking at?",
    image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=80&h=80&fit=crop",
    imageLabel: "Heavy Everyday Hoodie",
    imagePrice: "$58",
  },
  {
    type: "assistant",
    text: "Sure — I'll build one clean, wearable look for the green hoodie you're viewing. I'll explain it piece by piece.",
    outfit: [
      {
        number: 1,
        label: "Inner Layer / Shirt",
        item: "White Plain Oversized",
        price: "$40",
        thumbnail: "https://images.unsplash.com/photo-1622445275576-721325763afe?w=60&h=60&fit=crop",
        whyWorks: [
          "The white tee creates a break line that keeps the green hoodie from looking too solid.",
          "The white adds depth to the torso area.",
          "The oversized fit follows the flow of baggy pants.",
        ],
      },
      {
        number: 2,
        label: "Bottom",
        item: "Cozy Baggy Pants",
        price: "$120",
        thumbnail: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=60&h=60&fit=crop",
        whyWorks: [
          "The loose silhouette balances the shape of the hoodie.",
          "Black creates a strong neutral base, letting the green stand out.",
        ],
      },
    ],
  },
];

export default function AIAssistant() {
  const [message, setMessage] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-6 top-20 bg-white border border-gray-200 rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2 hover:shadow-xl transition z-40"
      >
        <Sparkles className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-bold">AI Assistant</span>
      </button>
    );
  }

  return (
    <aside className="w-[400px] shrink-0 border-l border-gray-100 bg-white flex flex-col h-full hidden xl:flex">
      {/* Header */}
      <div className="h-16 border-b border-gray-100 flex items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-gray-900" strokeWidth={2.5} />
          <span className="text-[15px] font-extrabold text-black">AI Assistant</span>
          <span className="bg-pink-100 text-purple-700 text-[11px] font-bold px-2.5 py-1 rounded-full">Analyze</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="p-1.5 hover:bg-gray-100 rounded transition">
            <PenLine className="w-4 h-4 text-gray-400" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-gray-100 rounded transition">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* User message */}
        <div className="flex justify-end">
          <div className="bg-gray-100 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[88%]">
            <div className="flex items-center gap-2.5 mb-2.5 bg-white rounded-xl px-2.5 py-2">
              <img src={chatMessages[0].image} className="w-10 h-10 rounded-lg object-cover" alt="" />
              <div className="flex-1">
                <p className="text-[12px] font-bold text-black leading-tight">{chatMessages[0].imageLabel}</p>
                <p className="text-[11px] font-semibold text-gray-500">{chatMessages[0].imagePrice}</p>
              </div>
            </div>
            <p className="text-[13px] text-gray-800 leading-relaxed font-medium">{chatMessages[0].text}</p>
          </div>
        </div>

        {/* Assistant message */}
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div className="flex-1 space-y-4">
            <p className="text-[13px] text-gray-800 leading-relaxed font-medium">{chatMessages[1].text}</p>

            {chatMessages[1].outfit.map((item) => (
              <div key={item.number} className="space-y-2.5">
                <p className="text-[13px] font-bold text-black">
                  {item.number}. {item.label}
                </p>
                <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                  <img src={item.thumbnail} className="w-10 h-10 rounded-lg object-cover" alt="" />
                  <div className="flex-1">
                    <p className="text-[12px] font-bold text-black leading-tight">{item.item}</p>
                  </div>
                  <span className="text-[13px] font-extrabold text-black">{item.price}</span>
                  <ExternalArrow />
                </div>
                <div className="bg-purple-50/40 rounded-xl px-3.5 py-3">
                  <p className="text-[12px] font-bold text-gray-800 mb-1.5">Why it works :</p>
                  <ul className="space-y-1.5">
                    {item.whyWorks.map((reason, i) => (
                      <li key={i} className="text-[12px] text-gray-600 leading-relaxed flex gap-2 font-medium">
                        <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-gray-400" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="px-5 pb-3 pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[11px] font-bold px-3 py-1.5 rounded-full border border-amber-200">
            <Sparkles className="w-3 h-3" /> Smart Compare
          </span>
          <span className="inline-flex items-center bg-purple-50 text-purple-700 text-[11px] font-bold px-3 py-1.5 rounded-full border border-purple-200">
            ✦ Mix & Match
          </span>
          <span className="inline-flex items-center bg-pink-50 text-pink-700 text-[11px] font-bold px-3 py-1.5 rounded-full border border-pink-200">
            ♡ Price Pulse
          </span>
          <button className="p-1">
            <MoreHorizontal className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-100">
        <div className="bg-gray-50 rounded-2xl px-4 py-3 border border-gray-100">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask for outfit ideas or anything you need..."
            className="w-full bg-transparent text-[13px] text-gray-800 placeholder-gray-400 outline-none mb-3 font-medium"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-black transition">
                <Paperclip className="w-3.5 h-3.5" /> Attach Files
              </button>
              <button className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-black transition">
                <Mic className="w-3.5 h-3.5" /> Voice Message
              </button>
            </div>
            <button className="w-7 h-7 bg-black rounded-full flex items-center justify-center hover:bg-gray-800 transition">
              <ArrowUp className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ExternalArrow() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}