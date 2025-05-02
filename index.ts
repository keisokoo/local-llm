import { tavily } from "@tavily/core";
import dotenv from "dotenv";
import { type Message, type Tool } from "ollama";

dotenv.config();

const client = tavily({
  apiKey: process.env.TAVILY_API_KEY,
});

async function webSearch(query: string) {
  const result = await client.search(query, {
    maxResults: 10,
    includeAnswer: true,
    includeImages: true,
    includeImageDescriptions: true,
    includeRawContent: true,
  });
  return result;
}

const toolFuncions = {
  webSearch,
};

const webSearchTool: Tool = {
  type: "function",
  function: {
    name: "webSearch",
    description: "web search tool, search web for information",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "search keyword",
        },
      },
      required: ["query"],
    },
  },
};

async function invoke(messages: Message[]) {
  let currentMessages = [...messages];
  let retryCount = 0;
  while (true) {
    console.log("retryCount", retryCount);
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      body: JSON.stringify({
        model: "mistral-small3.1",
        messages: currentMessages,
        temperature: 0,
        stream: true,
        ...(retryCount === 0 ? { tools: [webSearchTool] } : {}),
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No reader");
    }

    let toolCallOccurred = false;
    let toolCallsMessage: any = null;

    // 스트리밍 처리
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 데이터 파싱
      const text = new TextDecoder().decode(value);
      const lines = text.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        try {
          const json = JSON.parse(line);

          // 툴 호출 확인
          if (json.message?.tool_calls && json.message.tool_calls.length > 0) {
            toolCallOccurred = true;
            toolCallsMessage = json.message;
            // 툴 호출 메시지를 저장
            continue;
          }

          // 일반 텍스트 응답 처리
          if (json.message?.content) {
            console.log(json.message.content);
          }
        } catch (e) {
          console.error("Failed to parse JSON:", e);
        }
      }
    }

    // 툴 호출이 있었다면 처리
    if (toolCallOccurred && toolCallsMessage) {
      retryCount++;
      currentMessages.push(toolCallsMessage);

      const toolName = toolCallsMessage.tool_calls[0].function.name;
      // arguments가 문자열인지 객체인지 확인하여 적절히 처리
      let toolArgs: any;
      if (
        typeof toolCallsMessage.tool_calls[0].function.arguments === "string"
      ) {
        toolArgs = JSON.parse(
          toolCallsMessage.tool_calls[0].function.arguments
        );
      } else {
        toolArgs = toolCallsMessage.tool_calls[0].function.arguments;
      }
      const toolFunction = toolFuncions[toolName as keyof typeof toolFuncions];

      if (toolFunction) {
        const toolResult = await toolFunction(toolArgs.query);
        currentMessages.push({
          role: "tool",
          content: toolResult.toString(),
          name: toolName,
          tool_call_id: toolCallsMessage.tool_calls[0].id,
        } as Message);
      }
    } else {
      // 더 이상 툴 호출이 없으면 종료
      break;
    }
  }
}

// 실행
(async () => {
  await invoke([
    {
      role: "system",
      content:
        "You are a helpful assistant. current time is " +
        new Date().toLocaleDateString() +
        " 사용자의 요청과 일치하는 언어로 답변해주세요.",
    },
    {
      role: "user",
      content: "안녕하세요. 팔란티어의 한주간 주가를 알려줘.",
    },
  ]);
})();
