'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import styles from './page.module.css'

export default function Talker() {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [highlightedWordIndex, setHighlightedWordIndex] = useState(-1)
  const [conversationHistory, setConversationHistory] = useState([])
  const [chatSessions, setChatSessions] = useState([])
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [currentChatName, setCurrentChatName] = useState(null)
  const [sessionId] = useState(() => Math.random().toString(36).substring(7))
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioPlayerRef = useRef(null)
  const recordingStartTimeRef = useRef(null)
  const recognitionRef = useRef(null)
  const aiWordsRef = useRef([])
  const wordTimersRef = useRef([])

  const startRecording = async () => {
    if (!hasStartedChat) {
      setHasStartedChat(true)
      setCurrentSessionId(sessionId)
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'
        
        recognition.onresult = (event) => {
          let interimTranscript = ''
          let finalTranscript = ''
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' '
            } else {
              interimTranscript += transcript
            }
          }
          
          const combinedTranscript = (finalTranscript + interimTranscript).trim()
          setLiveTranscript(combinedTranscript)
          
          // Update chat name from live transcript if it's the first message
          if (!currentChatName && combinedTranscript) {
            const words = combinedTranscript.split(/\s+/).filter(w => w.length > 0)
            if (words.length > 0) {
              let chatName = words.slice(0, 6).join(' ')
              if (chatName.length > 35) {
                chatName = chatName.substring(0, 32) + '...'
              }
              setCurrentChatName(chatName)
            }
          }
        }
        
        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error)
        }
        
        recognition.onend = () => {
          if (recognitionRef.current === recognition) {
            try {
              recognition.start()
            } catch (e) {
              // Ignore errors when restarting
            }
          }
        }
        
        recognitionRef.current = recognition
        recognition.start()
      }
      
      let mimeType = 'audio/webm'
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
      ]
      
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type
          break
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      setLiveTranscript('')

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        if (recognitionRef.current) {
          recognitionRef.current.stop()
          recognitionRef.current = null
        }
        
        const recordingDuration = recordingStartTimeRef.current 
          ? Date.now() - recordingStartTimeRef.current 
          : 0
        
        if (recordingDuration < 200) {
          alert('Recording is too short. Please hold the button longer.')
          stream.getTracks().forEach(track => track.stop())
          setIsRecording(false)
          setLiveTranscript('')
          return
        }
        
        const actualMimeType = mediaRecorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType })
        
        if (audioBlob.size === 0) {
          alert('No audio recorded. Please try again.')
          stream.getTracks().forEach(track => track.stop())
          setIsRecording(false)
          setLiveTranscript('')
          return
        }
        
        await sendAudioToAPI(audioBlob)
        
        stream.getTracks().forEach(track => track.stop())
        // Live transcript will be cleared after API response
      }

      mediaRecorder.start()
      recordingStartTimeRef.current = Date.now()
      setIsRecording(true)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Please allow microphone access to use this feature.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
    }
  }

  const sendAudioToAPI = async (audioBlob) => {
    setIsProcessing(true)
    
    // Preserve live transcript before API call
    const preservedLiveTranscript = liveTranscript
    
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('sessionId', currentSessionId || sessionId)

      const response = await fetch('/api/voice-chat', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to process audio')
      }

      const data = await response.json()
      
      console.log('API Response:', data) // Debug log
      console.log('Live Transcript:', liveTranscript) // Debug log
      
      // Get user message from API response, fallback to preserved live transcript
      let userMessage = ''
      if (data.userTranscript && data.userTranscript.trim()) {
        userMessage = data.userTranscript.trim()
      } else if (preservedLiveTranscript && preservedLiveTranscript.trim()) {
        userMessage = preservedLiveTranscript.trim()
        console.warn('Using preserved live transcript as fallback')
      }
      
      if (userMessage) {
        setTranscript(userMessage)
        
        // Generate chat name from first user message (like ChatGPT)
        if (!currentChatName && userMessage) {
          // Take first few words, max 30 characters
          const words = userMessage.split(/\s+/).filter(w => w.length > 0)
          if (words.length > 0) {
            let chatName = words.slice(0, 6).join(' ') // Take up to 6 words
            if (chatName.length > 35) {
              chatName = chatName.substring(0, 32) + '...'
            }
            setCurrentChatName(chatName)
          }
        }
        
        setConversationHistory(prev => [
          ...prev,
          { role: 'user', text: userMessage }
        ])
      } else {
        console.error('No user transcript available from API or live transcript')
        // Still add a placeholder so user knows something happened
        setConversationHistory(prev => [
          ...prev,
          { role: 'user', text: '(Audio received, but no transcript available)' }
        ])
      }

      if (data.aiResponse) {
        setAiResponse(data.aiResponse)
        setConversationHistory(prev => [
          ...prev,
          { role: 'assistant', text: data.aiResponse }
        ])
      }

      if (data.audioUrl && data.aiResponse) {
        await playAudioWithHighlighting(data.audioUrl, data.aiResponse)
      }
      
      // Clear live transcript after successful API response
      setLiveTranscript('')
    } catch (error) {
      console.error('Error processing audio:', error)
      const errorMessage = error.message || 'Error processing your message. Please try again.'
      alert(errorMessage)
      setLiveTranscript('') // Clear on error too
    } finally {
      setIsProcessing(false)
      recordingStartTimeRef.current = null
    }
  }

  const handleMouseDown = () => {
    startRecording()
  }

  const handleMouseUp = () => {
    stopRecording()
  }

  const handleTouchStart = (e) => {
    e.preventDefault()
    startRecording()
  }

  const handleTouchEnd = (e) => {
    e.preventDefault()
    stopRecording()
  }

  const playAudioWithHighlighting = async (audioUrl, text) => {
    wordTimersRef.current.forEach(timer => clearTimeout(timer))
    wordTimersRef.current = []
    setHighlightedWordIndex(-1)
    
    const words = text.match(/\S+/g) || []
    aiWordsRef.current = words
    
    const audio = new Audio(audioUrl)
    audioPlayerRef.current = audio
    
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration
      const timePerWord = duration / words.length
      
      let currentIndex = 0
      const highlightNextWord = () => {
        if (currentIndex < words.length && !audio.paused) {
          setHighlightedWordIndex(currentIndex)
          currentIndex++
          
          if (currentIndex < words.length) {
            const timer = setTimeout(highlightNextWord, timePerWord * 1000)
            wordTimersRef.current.push(timer)
          }
        }
      }
      
      audio.addEventListener('play', () => {
        currentIndex = 0
        highlightNextWord()
      })
      
      audio.addEventListener('ended', () => {
        setHighlightedWordIndex(-1)
        wordTimersRef.current.forEach(timer => clearTimeout(timer))
        wordTimersRef.current = []
      })
      
      audio.addEventListener('pause', () => {
        setHighlightedWordIndex(-1)
        wordTimersRef.current.forEach(timer => clearTimeout(timer))
        wordTimersRef.current = []
      })
    })
    
    await audio.play()
  }

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      wordTimersRef.current.forEach(timer => clearTimeout(timer))
    }
  }, [])

  return (
    <main className={styles.container}>
      <div className={styles.spaceBackground}>
        <div className={styles.stars}></div>
        <div className={styles.stars2}></div>
        <div className={styles.stars3}></div>
        <div className={styles.dust1}></div>
        <div className={styles.dust2}></div>
        <div className={styles.dust3}></div>
        <div className={styles.dust4}></div>
        <div className={styles.dust5}></div>
        <div className={styles.planet1}></div>
        <div className={styles.planet2}></div>
        <div className={styles.planet3}></div>
        <div className={styles.planet4}></div>
        <div className={styles.nebula}></div>
      </div>

      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <Link href="/" className={styles.logoLink}>
            <div className={styles.logo}>
              <span className={styles.logoText}>CT</span>
            </div>
            <span className={styles.brandName}>CareerTalker</span>
          </Link>
        </div>
        <div className={styles.sessionsList}>
          {chatSessions.length === 0 && !hasStartedChat && (
            <div className={styles.emptyState}>
              <svg className={styles.emptyIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p>No previous chats</p>
            </div>
          )}
          {chatSessions.map((session, idx) => (
            <div key={idx} className={styles.sessionItem}>
              <svg className={styles.sessionIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className={styles.sessionText}>{session.name || `Chat ${idx + 1}`}</span>
            </div>
          ))}
          {hasStartedChat && (
            <div className={`${styles.sessionItem} ${styles.activeSession}`}>
              <svg className={styles.sessionIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className={styles.sessionText}>
                {currentChatName || (conversationHistory.length > 0 && conversationHistory.find(m => m.role === 'user')?.text
                  ? conversationHistory.find(m => m.role === 'user').text.split(/\s+/).slice(0, 4).join(' ')
                  : 'New Chat')}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.mainContent}>
        {!hasStartedChat ? (
          <div className={styles.welcomeScreen}>
            <div className={styles.welcomeContent}>
              <h1 className={styles.welcomeTitle}>Call them up</h1>
              <p className={styles.welcomeSubtitle}>Start a conversation with your AI career counselor</p>
              <button
                className={styles.startButton}
                onClick={startRecording}
              >
                <svg className={styles.startIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 5C3 3.89543 3.89543 3 5 3H8.27924C8.70967 3 9.09181 3.27543 9.22792 3.68377L10.7257 8.17721C10.8831 8.64932 10.6694 9.16531 10.2243 9.38787L7.96701 10.5165C9.06925 12.9612 11.0388 14.9308 13.4835 16.033L14.6121 13.7757C14.8347 13.3306 15.3507 13.1169 15.8228 13.2743L20.3162 14.7721C20.7246 14.9082 21 15.2903 21 15.7208V19C21 20.1046 20.1046 21 19 21H18C9.71573 21 3 14.2843 3 6V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Start Talking</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.chatArea}>
              <div className={styles.messagesContainer}>
                {conversationHistory.map((msg, idx) => (
                  <div key={idx} className={styles.messageWrapper}>
                    {msg.role === 'assistant' ? (
                      <div className={styles.aiMessage}>
                        <div className={styles.messageContent}>
                          <div className={styles.messageText}>
                            {msg.role === 'assistant' && idx === conversationHistory.length - 1 && aiWordsRef.current.length > 0
                              ? aiWordsRef.current.map((word, wordIdx) => (
                                  <span
                                    key={wordIdx}
                                    className={wordIdx === highlightedWordIndex ? styles.highlightedWord : ''}
                                  >
                                    {word}{' '}
                                  </span>
                                ))
                              : msg.text}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.userMessage}>
                        <div className={styles.messageContent}>
                          <div className={styles.messageText}>
                            {msg.text || msg.content || '...'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Show live transcript while recording (only if not already in history) */}
                {isRecording && liveTranscript && (
                  <div className={styles.messageWrapper}>
                    <div className={styles.userMessage}>
                      <div className={styles.messageContent}>
                        <div className={styles.messageText}>
                          {liveTranscript}
                          <span className={styles.liveIndicator}></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show recording indicator when recording but no transcript yet */}
                {isRecording && !liveTranscript && (
                  <div className={styles.messageWrapper}>
                    <div className={styles.userMessage}>
                      <div className={styles.messageContent}>
                        <div className={styles.recordingIndicator}>
                          <div className={styles.waveform}>
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                          <span className={styles.recordingText}>Listening...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.controls}>
              <button
                className={`${styles.recordButton} ${isRecording ? styles.recording : ''} ${isProcessing ? styles.processing : ''}`}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <svg className={styles.buttonIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="31.416" strokeDashoffset="31.416">
                      <animate attributeName="stroke-dasharray" dur="1.5s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/>
                      <animate attributeName="stroke-dashoffset" dur="1.5s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/>
                    </circle>
                  </svg>
                ) : isRecording ? (
                  <svg className={styles.buttonIcon} width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                ) : (
                  <svg className={styles.buttonIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 1C13.1 1 14 1.9 14 3V11C14 12.1 13.1 13 12 13C10.9 13 10 12.1 10 11V3C10 1.9 10.9 1 12 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 10V11C19 14.866 15.866 18 12 18C8.13401 18 5 14.866 5 11V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 18V22M8 22H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                <span className={styles.buttonText}>
                  {isProcessing ? 'Processing...' : isRecording ? 'Recording...' : 'Hold to Talk'}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

