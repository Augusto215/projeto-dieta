// Import required modules
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = 'https://slixymwrmifwomrjqsbk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaXh5bXdybWlmd29tcmpxc2JrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MTQ0OTQ1OSwiZXhwIjoyMDU3MDI1NDU5fQ.Kb1oTxZGzr9yP12ywwtS7JwVhop0u0UOq8BoHSl-jjc';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Set cookie with JWT token
const setAuthCookie = (res, token) => {
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'strict'
  });
};

// Login route
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    
    // Set auth cookie
    setAuthCookie(res, data.session.access_token);
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      redirectUrl: '/index2.html',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'An error occurred during login' });
  }
});

// Signup route
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    // Create user in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name
        }
      }
    });
    
    if (authError) {
      return res.status(400).json({ error: authError.message });
    }
    
    // Add user to profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name: name,
        email: email,
        created_at: new Date()
      });
    
    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Don't return error to client here, since auth user was created successfully
    }
    
    // Set auth cookie
    if (authData.session) {
      setAuthCookie(res, authData.session.access_token);
    }
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      redirectUrl: '/index2.html',
      user: {
        id: authData.user.id,
        email: authData.user.email
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'An error occurred during signup' });
  }
});

// Logout route
app.post('/api/logout', async (req, res) => {
  try {
    // Clear auth cookie
    res.clearCookie('authToken');
    
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    return res.status(200).json({ success: true, redirectUrl: '/' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'An error occurred during logout' });
  }
});

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  const token = req.cookies.authToken;
  
  if (!token) {
    return res.redirect('/');
  }
  
  try {
    // Verify token with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      res.clearCookie('authToken');
      return res.redirect('/');
    }
    
    req.user = data.user;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.clearCookie('authToken');
    return res.redirect('/');
  }
};

// Protected route middleware
app.get('/index2.html', authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index2.html'));
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});