#!/bin/bash

curl http://localhost:11434/api/chat -d '{
  "model": "mistral-small3.1",
  "temperature": 0,
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "안녕하세요. 조선시대의 역사를 알려줘"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_current_weather",
        "description": "Get the current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The location to get the weather for, e.g. San Francisco, CA"
            },
            "format": {
              "type": "string",
              "description": "The format to return the weather in, e.g. 'celsius' or 'fahrenheit'",
              "enum": ["celsius", "fahrenheit"]
            }
          },
          "required": ["location", "format"]
        }
      }
    }
  ]
}'