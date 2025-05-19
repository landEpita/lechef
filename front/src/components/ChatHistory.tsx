import React from "react";

type Message = { role: "user" | "bot"; text: string };

const ChatHistory: React.FC<{ history: Message[] }> = ({ history }) => {
  const lastTwoMessages = history.slice(-2);

  return (
    <div className="absolute bottom-[5%] left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md rounded-lg shadow-lg px-4 py-3 space-y-2 text-sm w-[460px]">
      {lastTwoMessages.map((msg, i) => (
        <div
          key={i}
          className={`px-3 py-1 rounded font-medium text-left break-words ${
            msg.role === "user"
              ? "bg-[#FACA7E] ml-10"
              : "bg-green-100 mr-10"
          } max-w-[400px]`}
        >
          {msg.text}
        </div>
      ))}
    </div>
  );
};

export default ChatHistory;
