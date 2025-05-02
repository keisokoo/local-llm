import {
  HumanMessage,
  SystemMessage,
  type AIMessage,
} from "@langchain/core/messages";
import {
  Annotation,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOllama } from "@langchain/ollama";
import { TavilySearch } from "@langchain/tavily";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import dotenv from "dotenv";

dotenv.config();
dayjs.extend(utc);
dayjs.extend(timezone);

const tavilyTool = new TavilySearch({
  maxResults: 5,
  topic: "general",
  // includeAnswer: false,
  includeRawContent: true,
  // includeImages: false,
  // includeImageDescriptions: false,
  // searchDepth: "basic",
  // timeRange: "day",
  // includeDomains: [],
  // excludeDomains: [],
});

export const StateWithSystemMessage = Annotation.Root({
  ...MessagesAnnotation.spec, // Spread in the messages state
  systemMessage: Annotation<SystemMessage>,
});
const llm = new ChatOllama({
  model: "mistral-small3.1:latest",
  temperature: 0,
  maxRetries: 2,
  streaming: true,
}).bindTools([tavilyTool]);

const setGraph = () => {
  const callAgent = async (state: typeof StateWithSystemMessage.State) => {
    const response = await llm.invoke([
      {
        role: "system",
        content: state.systemMessage.content,
      },
      ...state.messages,
    ]);
    return {
      systemMessage: state.systemMessage,
      messages: [...state.messages, response],
    };
  };
  const toolNode = new ToolNode([tavilyTool]);
  const routeModelOutput = (state: typeof StateWithSystemMessage.State) => {
    const messages = state.messages;
    const lastMessage: AIMessage = messages[messages.length - 1];
    if ((lastMessage?.tool_calls?.length ?? 0) > 0) {
      return "tools";
    }
    return "__end__";
  };
  const workflow = new StateGraph(StateWithSystemMessage)
    .addNode("callAgent", callAgent)
    .addNode("tools", toolNode);
  workflow.addEdge("__start__", "callAgent");
  workflow
    .addConditionalEdges("callAgent", routeModelOutput, ["tools", "__end__"])
    .addEdge("tools", "callAgent");
  return workflow.compile();
};

const graph = setGraph();

graph.invoke(
  {
    systemMessage: new SystemMessage(
      `You are a helpful assistant. 사용자의 요청과 일치하는 언어로 답변해주세요.
      사용자의 지역은 대한민국이며, 현재 시간은 ${dayjs()
        .tz("Asia/Seoul")
        .format("YYYY-MM-DD HH:mm:ss")}입니다.
      `
    ),
    messages: [
      new HumanMessage(
        "팔란티어의 한주간 주가를 확인하고, 주가 추세를 분석해주세요."
      ),
    ],
  },
  {
    callbacks: [
      {
        handleLLMNewToken(token: string) {
          process.stdout.write(token);
        },
      },
    ],
  }
);
