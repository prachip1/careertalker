'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignIn = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    
    // Simulate sign-in (no actual auth for MVP)
    setTimeout(() => {
      router.push('/talker')
    }, 500)
  }

  return (
    <div className={styles.signInContainer}>
      <div className={styles.backgroundAnimation}>
        <div className={styles.stars}></div>
        <div className={styles.stars2}></div>
        <div className={styles.stars3}></div>
        <div className={styles.dust1}></div>
        <div className={styles.dust2}></div>
        <div className={styles.dust3}></div>
        <div className={styles.dust4}></div>
        <div className={styles.planet1}></div>
        <div className={styles.planet2}></div>
        <div className={styles.planet3}></div>
        <div className={styles.comet}></div>
      </div>
      
      <div className={styles.signInContent}>
        <div className={styles.logoContainer}>
          <div className={styles.logo}>
            <span className={styles.logoText}>CT</span>
          </div>
          <h1 className={styles.brandName}>CareerTalker</h1>
        </div>
        
        <div className={styles.signInCard}>
          <h2 className={styles.signInTitle}>Welcome Back</h2>
          <p className={styles.signInSubtitle}>Sign in to continue your career journey</p>
          
          <form onSubmit={handleSignIn} className={styles.signInForm}>
            <div className={styles.inputGroup}>
              <svg className={styles.inputIcon} width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 6.66667L10 11.6667L17.5 6.66667M2.5 13.3333H17.5V6.66667H2.5V13.3333Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                required
              />
            </div>
            
            <button
              type="submit"
              className={styles.signInButton}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className={styles.loadingSpinner}></span>
              ) : (
                <>
                  <span>Sign In</span>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
