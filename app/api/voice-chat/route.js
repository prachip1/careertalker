import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// In-memory session storage
const sessions = {}

// Get or create session
function getSession(sessionId) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      current_country: null,
      target_country: null,
      role: null,
      experience_years: null,
      conversation_history: [],
    }
  }
  return sessions[sessionId]
}

// Build system prompt with session context
function buildSystemPrompt(session) {
  let prompt = `You are an experienced career counselor. You help early-career professionals make better career and resume decisions.

You always tailor advice based on:
- User's current country: ${session.current_country || 'not yet provided'}
- User's target job country: ${session.target_country || 'not yet provided'}
- Role and domain: ${session.role || 'not yet provided'}
- Experience level: ${session.experience_years ? `${session.experience_years} years` : 'not yet provided'}

You ask thoughtful follow-up questions. You do not overwhelm the user. You give practical, realistic advice.

You do NOT give legal, visa, or guaranteed job advice.

You speak like a human mentor, not a chatbot.

IMPORTANT: If any of the above information is "not yet provided", you MUST gather it conversationally before giving detailed advice. Ask ONE question at a time. Be natural and warm.

When you have all the information, provide country-specific guidance:
- If target country is USA → emphasize referrals, portfolios, networking, ATS optimization
- If target country is Germany → CV format (Lebenslauf), certifications, language requirements
- If target country is India → ATS keywords, service vs product companies, technical skills emphasis
- If target country is UK → CV format, cover letters, professional qualifications
- If target country is Canada → bilingual considerations, provincial differences, credential assessment
- Adapt your advice based on the specific country context

Keep responses concise (2-3 sentences typically, up to 4-5 for detailed advice). Be conversational and supportive.`

  return prompt
}

// Extract information from user message using GPT
async function extractSessionInfo(session, userMessage) {
  // Only extract if we're missing information
  const missingInfo = []
  if (!session.current_country) missingInfo.push('current_country')
  if (!session.target_country) missingInfo.push('target_country')
  if (!session.role) missingInfo.push('role')
  if (!session.experience_years) missingInfo.push('experience_years')
  
  if (missingInfo.length === 0) return // Nothing to extract
  
  // Use GPT to extract structured information
  const extractionPrompt = `Extract the following information from this user message. Return ONLY a JSON object with the fields that you can identify. If a field is not mentioned, omit it.

Fields to extract:
- current_country: The country where the user currently lives/works (e.g., "USA", "India", "Germany")
- target_country: The country where the user wants to work (e.g., "USA", "UK", "Canada")
- role: The user's job role or domain (e.g., "software developer", "data scientist", "designer")
- experience_years: Number of years of experience (just the number, e.g., 3)

User message: "${userMessage}"

Return ONLY valid JSON, nothing else. Example: {"current_country": "India", "experience_years": 2}`

  try {
    const extraction = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that extracts structured information from text. Return only valid JSON.' },
        { role: 'user', content: extractionPrompt }
      ],
      temperature: 0.3,
      max_tokens: 150,
    })
    
    const responseText = extraction.choices[0].message.content.trim()
    // Remove markdown code blocks if present
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const extracted = JSON.parse(jsonText)
    
    // Update session with extracted info
    if (extracted.current_country && !session.current_country) {
      session.current_country = extracted.current_country
    }
    if (extracted.target_country && !session.target_country) {
      session.target_country = extracted.target_country
    }
    if (extracted.role && !session.role) {
      session.role = extracted.role
    }
    if (extracted.experience_years && !session.experience_years) {
      session.experience_years = parseInt(extracted.experience_years)
    }
  } catch (error) {
    // If extraction fails, fall back to simple pattern matching
    console.log('GPT extraction failed, using fallback:', error.message)
    extractSessionInfoFallback(session, userMessage)
  }
}

// Fallback extraction using simple patterns
function extractSessionInfoFallback(session, userMessage) {
  const lowerMessage = userMessage.toLowerCase()
  
  // Extract experience years
  if (!session.experience_years) {
    const expMatch = lowerMessage.match(/(\d+)\s*(?:years?|yrs?)/)
    if (expMatch) {
      session.experience_years = parseInt(expMatch[1])
    }
  }
  
  // Simple country extraction (basic patterns)
  // This is a fallback - GPT extraction is preferred
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio')
    const sessionId = formData.get('sessionId')

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    // Get session
    const session = getSession(sessionId)

    // Step 1: Convert audio to text using Whisper
    // Get the audio file as a buffer
    const inputAudioBuffer = Buffer.from(await audioFile.arrayBuffer())
    
    // Verify we have audio data
    if (inputAudioBuffer.length === 0) {
      return NextResponse.json(
        { error: 'Empty audio file' },
        { status: 400 }
      )
    }
    
    // Determine file extension and mime type from the uploaded file
    const audioMimeType = audioFile.type || 'audio/webm'
    let fileExtension = 'webm'
    let fileName = 'audio.webm'
    
    // Map mime types to file extensions
    if (audioMimeType.includes('mp4')) {
      fileExtension = 'mp4'
      fileName = 'audio.mp4'
    } else if (audioMimeType.includes('ogg')) {
      fileExtension = 'ogg'
      fileName = 'audio.ogg'
    } else if (audioMimeType.includes('webm')) {
      fileExtension = 'webm'
      fileName = 'audio.webm'
    }
    
    // Save audio to temporary file first (helps with format compatibility)
    const tempDir = path.join(process.cwd(), 'tmp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    const inputAudioFileName = `input_${sessionId}_${Date.now()}.${fileExtension}`
    const inputAudioFilePath = path.join(tempDir, inputAudioFileName)
    fs.writeFileSync(inputAudioFilePath, inputAudioBuffer)
    
    // Create a File object from the saved file for OpenAI Whisper
    // Read the file back to ensure proper format
    const fileBuffer = fs.readFileSync(inputAudioFilePath)
    const audioUint8Array = new Uint8Array(fileBuffer)
    
    // Create File object with proper metadata matching the original file type
    const audioFileForOpenAI = new File(
      [audioUint8Array], 
      fileName, 
      { 
        type: audioMimeType,
        lastModified: Date.now()
      }
    )

    let userTranscript
    try {
      const transcription = await openai.audio.transcriptions.create({
        file: audioFileForOpenAI,
        model: 'whisper-1',
        language: 'en', // Optional: specify language for better accuracy
      })
      userTranscript = transcription.text || ''
      console.log('Whisper transcription result:', userTranscript) // Debug log
    } catch (whisperError) {
      // Clean up input audio file on error
      try {
        if (fs.existsSync(inputAudioFilePath)) {
          fs.unlinkSync(inputAudioFilePath)
        }
      } catch (cleanupErr) {
        console.error('Error cleaning up input audio file:', cleanupErr)
      }
      
      // Provide user-friendly error messages
      if (whisperError.code === 'audio_too_short' || 
          (whisperError.message && whisperError.message.includes('too short'))) {
        return NextResponse.json(
          { error: 'Audio recording is too short. Please hold the button longer (at least 0.2 seconds).' },
          { status: 400 }
        )
      }
      
      if (whisperError.message && whisperError.message.includes('could not be decoded')) {
        return NextResponse.json(
          { error: 'Audio format not supported. Please try recording again or use a different browser.' },
          { status: 400 }
        )
      }
      
      throw whisperError
    }
    
    // Clean up input audio file immediately after successful transcription
    try {
      if (fs.existsSync(inputAudioFilePath)) {
        fs.unlinkSync(inputAudioFilePath)
      }
    } catch (cleanupErr) {
      console.error('Error cleaning up input audio file:', cleanupErr)
    }

    // Step 2: Update conversation history
    // Ensure userTranscript is a string (not undefined or null)
    const safeUserTranscript = userTranscript || ''
    
    if (safeUserTranscript) {
      session.conversation_history.push({
        role: 'user',
        content: safeUserTranscript,
      })
    } else {
      console.warn('Warning: Empty user transcript received from Whisper')
    }

    // Step 3: Extract session information from user message
    if (safeUserTranscript) {
      await extractSessionInfo(session, safeUserTranscript)
    }

    // Step 4: Build messages for GPT
    const systemPrompt = buildSystemPrompt(session)
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...session.conversation_history.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    ]

    // Step 5: Get response from GPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.7,
      max_tokens: 300,
    })

    const aiResponse = completion.choices[0].message.content

    // Step 6: Update conversation history with AI response
    session.conversation_history.push({
      role: 'assistant',
      content: aiResponse,
    })

    // Step 7: Convert AI response to speech using TTS
    const ttsResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
      input: aiResponse,
    })

    const ttsAudioBuffer = Buffer.from(await ttsResponse.arrayBuffer())
    
    // Save audio to temporary file (reuse tempDir from earlier)
    // tempDir is already defined above, just ensure it exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    const audioFileName = `audio_${sessionId}_${Date.now()}.mp3`
    const audioFilePath = path.join(tempDir, audioFileName)
    fs.writeFileSync(audioFilePath, ttsAudioBuffer)

    // Step 8: Return response
    // Read the file and convert to base64 for response
    const audioBase64 = fs.readFileSync(audioFilePath).toString('base64')
    const audioDataUrl = `data:audio/mpeg;base64,${audioBase64}`

    // Clean up temp file after a delay (or implement proper cleanup)
    setTimeout(() => {
      try {
        if (fs.existsSync(audioFilePath)) {
          fs.unlinkSync(audioFilePath)
        }
      } catch (err) {
        console.error('Error cleaning up temp file:', err)
      }
    }, 60000) // Clean up after 1 minute

    return NextResponse.json({
      userTranscript: safeUserTranscript || userTranscript || '', // Always return a string, never undefined
      aiResponse: aiResponse,
      audioUrl: audioDataUrl,
      session: {
        current_country: session.current_country,
        target_country: session.target_country,
        role: session.role,
        experience_years: session.experience_years,
      },
    })
  } catch (error) {
    console.error('Error in voice-chat API:', error)
    return NextResponse.json(
      { error: 'Failed to process voice chat', details: error.message },
      { status: 500 }
    )
  }
}

