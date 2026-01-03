# AI Agent Implementation Example

This document shows a concrete example of how to modify your code to add function calling capabilities.

## Example: Adding a "Search Job Listings" Tool

Here's how you would modify your API route to support function calling:

### Modified API Route Structure

```javascript
// Tools definition
const tools = [
  {
    type: "function",
    function: {
      name: "search_job_listings",
      description: "Search for job listings in a specific country for a given role",
      parameters: {
        type: "object",
        properties: {
          country: {
            type: "string",
            description: "The country to search jobs in (e.g., 'USA', 'India', 'UK')"
          },
          role: {
            type: "string",
            description: "The job role or title (e.g., 'software developer', 'data scientist')"
          },
          experience: {
            type: "number",
            description: "Years of experience required"
          }
        },
        required: ["country", "role"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_salary_data",
      description: "Get average salary information for a role in a specific country",
      parameters: {
        type: "object",
        properties: {
          country: {
            type: "string",
            description: "The country (e.g., 'USA', 'India', 'UK')"
          },
          role: {
            type: "string",
            description: "The job role or title"
          },
          experience: {
            type: "number",
            description: "Years of experience"
          }
        },
        required: ["country", "role"]
      }
    }
  }
]

// Tool execution functions
async function executeSearchJobListings(country, role, experience) {
  // In a real implementation, you would call an actual job API
  // For now, this is a mock example
  const mockJobs = [
    {
      title: `${role} - ${country}`,
      company: "Tech Corp",
      location: country,
      experience: experience || "Not specified",
      date: new Date().toISOString()
    }
  ]
  
  return {
    success: true,
    jobs: mockJobs,
    count: mockJobs.length,
    message: `Found ${mockJobs.length} job listings for ${role} in ${country}`
  }
}

async function executeGetSalaryData(country, role, experience) {
  // Mock salary data - in real implementation, call salary API
  const mockSalaries = {
    "USA": { min: 80000, max: 150000, average: 110000, currency: "USD" },
    "India": { min: 500000, max: 2000000, average: 1200000, currency: "INR" },
    "UK": { min: 40000, max: 90000, average: 60000, currency: "GBP" },
  }
  
  const salary = mockSalaries[country] || mockSalaries["USA"]
  
  return {
    success: true,
    country: country,
    role: role,
    salary: salary,
    experience: experience || "Entry level"
  }
}

// Modified conversation flow
async function processWithTools(messages, session) {
  let maxIterations = 5 // Prevent infinite loops
  let iteration = 0
  
  while (iteration < maxIterations) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      tools: tools,
      tool_choice: 'auto', // Let model decide when to use tools
      temperature: 0.7,
    })
    
    const message = completion.choices[0].message
    
    // Add assistant message to conversation
    messages.push(message)
    
    // Check if model wants to call a tool
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Execute all tool calls
      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name
        const functionArgs = JSON.parse(toolCall.function.arguments)
        
        let toolResult
        
        // Execute the appropriate tool
        switch (functionName) {
          case 'search_job_listings':
            toolResult = await executeSearchJobListings(
              functionArgs.country,
              functionArgs.role,
              functionArgs.experience
            )
            break
          case 'get_salary_data':
            toolResult = await executeGetSalaryData(
              functionArgs.country,
              functionArgs.role,
              functionArgs.experience
            )
            break
          default:
            toolResult = { error: `Unknown tool: ${functionName}` }
        }
        
        // Add tool result to messages
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        })
      }
      
      // Continue the loop to let model process tool results
      iteration++
      continue
    }
    
    // No tool calls - we have the final response
    return message.content
  }
  
  throw new Error('Max iterations reached in tool calling loop')
}
```

### Key Changes to Your route.js

1. **Add tools array** at the top of the file
2. **Create tool execution functions** for each tool
3. **Replace the simple GPT call** with `processWithTools()` function
4. **Handle tool_calls** in the response

### Updated System Prompt

You should also update your system prompt to mention tool availability:

```javascript
function buildSystemPrompt(session) {
  return `You are an experienced career counselor with access to real-time tools.

You can use these tools when helpful:
- search_job_listings: Find actual job openings
- get_salary_data: Get salary information

Use tools when:
- User asks about specific jobs or opportunities
- User wants salary information
- User needs concrete data to make decisions

Always explain what you're doing when using tools. Be transparent with the user.

[... rest of your existing prompt ...]`
}
```

## Real-World Tool Implementations

### Example: Real Job Search API Integration

```javascript
async function executeSearchJobListings(country, role, experience) {
  try {
    // Example: Using SerpAPI or similar service
    const response = await fetch(`https://serpapi.com/search?engine=google_jobs&q=${role}+${country}&api_key=${process.env.SERPAPI_KEY}`)
    const data = await response.json()
    
    return {
      success: true,
      jobs: data.jobs_results?.slice(0, 10) || [],
      count: data.jobs_results?.length || 0
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}
```

### Example: Real Salary Data API

```javascript
async function executeGetSalaryData(country, role, experience) {
  try {
    // Example: Using Adzuna API or similar
    const response = await fetch(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_KEY}&what=${role}`)
    const data = await response.json()
    
    // Calculate average salary from results
    const salaries = data.results?.map(job => job.salary_min).filter(Boolean) || []
    const average = salaries.reduce((a, b) => a + b, 0) / salaries.length
    
    return {
      success: true,
      average_salary: average,
      currency: "USD", // or detect from country
      data_points: salaries.length
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}
```

## Testing the Agent

1. User asks: "What jobs are available for software developers in the USA?"
2. Model decides to call `search_job_listings(country: "USA", role: "software developer")`
3. Tool executes and returns job data
4. Model processes the results and responds: "I found 10 software developer positions in the USA. Here are the top opportunities..."
5. User hears the response via TTS

## Next Steps

1. Choose which tools to implement first
2. Set up API keys for external services (if needed)
3. Implement the tool execution functions
4. Update the API route with function calling
5. Test with various user queries

