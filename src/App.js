import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { 
  createTheme, ThemeProvider, CssBaseline, Box, Button, Typography, 
  Container, Paper, TextField, CircularProgress, Grid, 
  IconButton, Stack, Alert, Card, CardActionArea,
  Dialog, DialogTitle, DialogActions, Divider, DialogContent, DialogContentText
} from '@mui/material';
import { motion } from 'framer-motion';

// Icons
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import PersonIcon from '@mui/icons-material/Person';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import PersonAddIcon from '@mui/icons-material/PersonAdd'; 
import DashboardIcon from '@mui/icons-material/Dashboard';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GoogleIcon from '@mui/icons-material/Google';

// --- IMPORT YOUR DASHBOARDS ---
import Dashboard from './Dashboard';
import AdminConsole from './AdminConsole'; 

// Firebase Logic
import { auth, db, SECRET_INVITE_CODE, OWNER_EMAIL } from './firebase';
import { 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, 
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail 
} from 'firebase/auth';
import { doc, getDoc, runTransaction, collection, query, where, getDocs } from 'firebase/firestore';

// ==========================================
// 1. THEME CONFIGURATION
// ==========================================
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#FFD600', contrastText: '#000' },
    secondary: { main: '#FFFFFF' },
    background: { default: '#000000', paper: '#121212' }, 
    text: { primary: '#FFFFFF', secondary: '#B0B0B0' },
    success: { main: '#00E676' }
  },
  typography: { fontFamily: "'Poppins', sans-serif" },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 12, textTransform: 'none', fontWeight: 600, padding: '12px 24px' } } },
    MuiPaper: { styleOverrides: { root: { borderRadius: 16, backgroundImage: 'none', border: '1px solid rgba(255, 214, 0, 0.1)' } } },
    MuiTextField: { styleOverrides: { root: { '& .MuiOutlinedInput-root': { borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.05)', '&.Mui-focused fieldset': { borderColor: '#FFD600' } } } } },
    MuiDialog: { styleOverrides: { paper: { backgroundColor: '#1E1E1E', border: '1px solid #FFD600', borderRadius: 16, padding: '20px', textAlign: 'center' } } }
  }
});

// ==========================================
// 2. HELPER COMPONENTS
// ==========================================
const CenteredContainer = ({ children }) => (
  <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, px: 2 }}>
    {children}
  </Box>
);

const Background = () => (
  <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1, overflow: 'hidden', bgcolor: '#000' }}>
    <motion.div animate={{ opacity: [0.4, 0.6, 0.4] }} transition={{ duration: 5, repeat: Infinity }}>
      <Box sx={{ position: 'absolute', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255, 214, 0, 0.1) 0%, rgba(0,0,0,0) 70%)', top: '-20%', left: '-10%', filter: 'blur(80px)' }} />
    </motion.div>
  </Box>
);

const LoadingOverlay = ({ message }) => (
  <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', bgcolor: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
    <CircularProgress size={60} color="primary" />
    <Typography variant="h6" sx={{ mt: 3, color: '#FFD600', letterSpacing: 1, textAlign: 'center', px: 2 }}>{message}</Typography>
  </Box>
);

// ==========================================
// 3. AUTH & LANDING PAGES
// ==========================================
function LandingPage() {
  const navigate = useNavigate();
  return (
    <CenteredContainer>
      <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <Typography 
            variant="h2" fontWeight="900" 
            sx={{ mb: 2, letterSpacing: -1, lineHeight: 1.1, fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4rem' } }}
          >
            TEAM <span style={{ color: '#FFD600', display: 'inline-block' }}>ICONIC</span> TRACKER
          </Typography>
          <Typography variant="h6" color="textSecondary" sx={{ mb: 6, fontWeight: 400, fontSize: { xs: '1rem', md: '1.25rem' } }}>
            High-performance team management operating system.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="center">
            <Button variant="contained" color="primary" size="large" onClick={() => navigate('/login')} startIcon={<VpnKeyIcon />} sx={{ width: { xs: '100%', sm: 'auto' } }}>Login</Button>
            <Button variant="outlined" color="secondary" size="large" onClick={() => navigate('/signup')} startIcon={<PersonAddIcon />} sx={{ width: { xs: '100%', sm: 'auto' } }}>Sign Up</Button>
          </Stack>
        </motion.div>
      </Container>
    </CenteredContainer>
  );
}

function SignupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [formData, setFormData] = useState({ fullName: '', designation: '', email: '', mobile: '', dob: '', password: '', secretCode: '' });

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSignup = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (formData.secretCode !== SECRET_INVITE_CODE) throw new Error("Invalid Invite Code.");
      const mobileQuery = query(collection(db, "users"), where("mobile", "==", formData.mobile));
      const mobileSnap = await getDocs(mobileQuery);
      if (!mobileSnap.empty) throw new Error("Mobile number already registered.");
      
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, "metadata", "user_counters");
        const counterDoc = await transaction.get(counterRef);
        let newIndex = 1;
        if (counterDoc.exists()) newIndex = counterDoc.data().last_employee_index + 1;
        
        let assignedRole = "Member"; let assignedAccess = 1;
        // SAFE OWNER CHECK
        if (OWNER_EMAIL && formData.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) { 
            assignedRole = "Owner"; assignedAccess = 3; 
        }

        transaction.set(counterRef, { last_employee_index: newIndex }, { merge: true });
        transaction.set(doc(db, "users", user.uid), {
          uid: user.uid, employeeId: `TCT${String(newIndex).padStart(3, '0')}`, 
          fullName: formData.fullName, designation: formData.designation, 
          email: formData.email, mobile: formData.mobile, dob: formData.dob, 
          role: assignedRole, accessLevel: assignedAccess, createdAt: new Date().toISOString()
        });
      });
      setSuccessModalOpen(true);
    } catch (err) { setError(err.message.replace("Firebase: ", "")); } finally { setLoading(false); }
  };

  const handleCloseModal = () => { setSuccessModalOpen(false); navigate('/login', { replace: true }); };

  return (
    <CenteredContainer>
      {loading && <LoadingOverlay message="Creating Account..." />}
      <Container maxWidth="md">
        <Paper sx={{ p: { xs: 3, md: 5 }, position: 'relative' }}>
          <IconButton onClick={() => navigate('/')} sx={{ position: 'absolute', top: 10, left: 10, color: 'text.secondary' }}><ArrowBackIcon /></IconButton>
          <Typography variant="h4" fontWeight="bold" textAlign="center" sx={{ mb: 4, color: '#FFD600', mt: 3, fontSize: { xs: '1.75rem', md: '2.125rem' } }}>Sign Up</Typography>
          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          <form onSubmit={handleSignup}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}><TextField fullWidth required label="Full Name" name="fullName" onChange={handleChange} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth required label="Designation" name="designation" onChange={handleChange} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth required label="Date of Birth" type="date" name="dob" onChange={handleChange} InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth required label="Mobile Number" name="mobile" onChange={handleChange} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth required label="Email" name="email" type="email" onChange={handleChange} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth required label="Password" name="password" type={showPass ? "text" : "password"} onChange={handleChange} InputProps={{ endAdornment: <IconButton onClick={()=>setShowPass(!showPass)} edge="end">{showPass ? <VisibilityOff /> : <Visibility />}</IconButton> }} /></Grid>
              <Grid item xs={12}><TextField fullWidth required label="Secret Invite Code" name="secretCode" onChange={handleChange} sx={{ input: { color: '#FFD600', fontWeight: 'bold', textAlign: 'center', letterSpacing: 2 } }} /></Grid>
            </Grid>
            <Button type="submit" fullWidth variant="contained" size="large" sx={{ mt: 4, height: 50 }}>Sign Up</Button>
          </form>
        </Paper>
      </Container>
      <Dialog open={successModalOpen} onClose={handleCloseModal}><Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}><CheckCircleIcon color="success" sx={{ fontSize: 60 }} /></Box><DialogTitle variant="h5" fontWeight="bold">Account Created!</DialogTitle><DialogActions sx={{ justifyContent: 'center', pb: 3 }}><Button onClick={handleCloseModal} variant="contained" color="primary">Go to Login</Button></DialogActions></Dialog>
    </CenteredContainer>
  );
}

function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(''); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // --- FORGOT PASSWORD STATES ---
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // --- 1. EMAIL LOGIN ---
  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await checkAndRedirect(userCredential.user);
    } catch (err) { setError("Invalid Credentials. If you signed in with Google recently, your password might need to be reset."); setLoading(false); }
  };

  // --- 2. GOOGLE LOGIN ---
  const handleGoogleLogin = async () => {
    setLoading(true); setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await checkAndRedirect(result.user);
    } catch (err) { 
      console.error(err);
      setError(`Google Sign-In failed: ${err.message}`); // Show actual error
      setLoading(false); 
    }
  };

  // --- 3. PASSWORD RESET HANDLER ---
  const handleResetPassword = async () => {
    if (!resetEmail) { setError("Please enter your email."); return; }
    setLoading(true);
    try {
        await sendPasswordResetEmail(auth, resetEmail);
        setMessage("Link sent! Set a new password via email, and BOTH login methods will work.");
        setResetDialogOpen(false);
    } catch (err) {
        setError("Error sending reset email. Please check the address.");
    } finally {
        setLoading(false);
    }
  };

  // --- 4. REDIRECT LOGIC ---
  const checkAndRedirect = async (user) => {
    try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const userData = docSnap.data();
            if (userData.accessLevel > 1) navigate('/mode-select', { replace: true });
            else navigate('/dashboard', { replace: true });
        } else {
            await createGoogleUserProfile(user);
            navigate('/dashboard', { replace: true });
        }
    } catch (err) {
        console.error(err);
        setError("Error fetching profile: " + err.message);
    } finally {
        setLoading(false);
    }
  };

  // --- 5. GOOGLE PROFILE CREATION ---
  const createGoogleUserProfile = async (user) => {
    await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, "metadata", "user_counters");
        const counterDoc = await transaction.get(counterRef);
        let newIndex = 1;
        if (counterDoc.exists()) newIndex = counterDoc.data().last_employee_index + 1;
        
        let assignedRole = "Member"; 
        let assignedAccess = 1;
        // SAFE OWNER CHECK (Prevent crash if OWNER_EMAIL undefined)
        if (OWNER_EMAIL && user.email && user.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) { 
            assignedRole = "Owner"; assignedAccess = 3; 
        }

        transaction.set(counterRef, { last_employee_index: newIndex }, { merge: true });
        transaction.set(doc(db, "users", user.uid), {
          uid: user.uid, 
          employeeId: `TCT${String(newIndex).padStart(3, '0')}`, 
          fullName: user.displayName || "Google User", 
          designation: "Member", 
          email: user.email, 
          mobile: "", 
          dob: "", 
          role: assignedRole, 
          accessLevel: assignedAccess, 
          createdAt: new Date().toISOString(),
          authMethod: "google"
        });
    });
  };

  return (
    <CenteredContainer>
      {loading && <LoadingOverlay message="Processing..." />}
      <Container maxWidth="xs">
        <Paper sx={{ p: { xs: 3, md: 4 }, width: '100%', position: 'relative' }}>
          <IconButton onClick={() => navigate('/')} sx={{ position: 'absolute', top: 10, left: 10, color: 'text.secondary' }}><ArrowBackIcon /></IconButton>
          
          <Box sx={{ textAlign: 'center', mb: 3, mt: 2 }}>
            <Typography variant="h4" fontWeight="bold" color="primary" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>Login</Typography>
          </Box>
          
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
          
          {/* EMAIL FORM */}
          <form onSubmit={handleLogin}>
            <TextField fullWidth required label="Email" margin="normal" value={email} onChange={(e)=>setEmail(e.target.value)} />
            <TextField fullWidth required label="Password" type="password" margin="normal" value={password} onChange={(e)=>setPassword(e.target.value)} />
            
            {/* FORGOT PASSWORD BUTTON */}
            <Box sx={{ textAlign: 'right', mt: 1 }}>
                <Button size="small" onClick={() => setResetDialogOpen(true)} sx={{ color: 'text.secondary', textTransform: 'none', fontSize: '0.8rem' }}>
                    Forgot Password?
                </Button>
            </Box>

            <Button type="submit" fullWidth variant="contained" size="large" sx={{ mt: 2, mb: 1 }}>Login</Button>
          </form>

          {/* GOOGLE BUTTON */}
          <Divider sx={{ my: 2, color: 'text.secondary', fontSize: '0.8rem' }}>OR</Divider>
          <Button 
            fullWidth 
            variant="outlined" 
            startIcon={<GoogleIcon />} 
            onClick={handleGoogleLogin}
            sx={{ 
                color: '#fff', 
                borderColor: 'rgba(255,255,255,0.2)', 
                '&:hover': { borderColor: '#FFD600', bgcolor: 'rgba(255, 214, 0, 0.05)' } 
            }}
          >
            Sign in with Google
          </Button>

          <Button size="small" onClick={()=>navigate('/signup')} sx={{ color: '#FFD600', width: '100%', mt: 2 }}>Sign Up</Button>
        </Paper>
      </Container>

      {/* --- FORGOT PASSWORD DIALOG --- */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)}>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
            <DialogContentText>
                Enter your email address. We will send you a link to reset your password. <br/><br/>
                <b>Note:</b> This will enable "Password Login" again if you lost it after using Google.
            </DialogContentText>
            <TextField
                autoFocus
                margin="dense"
                id="name"
                label="Email Address"
                type="email"
                fullWidth
                variant="outlined"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
            />
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setResetDialogOpen(false)} color="secondary">Cancel</Button>
            <Button onClick={handleResetPassword} variant="contained" color="primary">Send Link</Button>
        </DialogActions>
      </Dialog>

    </CenteredContainer>
  );
}

function ModeSelectPage({ user }) {
  const navigate = useNavigate();
  if (!user || user.accessLevel < 2) return <Navigate to="/" replace />;
  return (
    <CenteredContainer>
      <Container maxWidth="md">
        <Typography 
          variant="h4" 
          textAlign="center" 
          fontWeight="bold" 
          sx={{ mb: 1, color: 'white', fontSize: { xs: '1.5rem', md: '2.125rem' } }}
        >
          Welcome, {user.designation}
        </Typography>
        <Typography variant="body1" textAlign="center" color="textSecondary" sx={{ mb: 6 }}>Select your interface mode</Typography>
        
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12} sm={6} md={5}>
            <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.1)' }}>
              <CardActionArea sx={{ height: '100%', p: { xs: 3, md: 4 }, textAlign: 'center' }} onClick={() => navigate('/dashboard', { replace: true })}>
                <PersonIcon sx={{ fontSize: { xs: 50, md: 60 }, color: '#FFD600', mb: 2 }} />
                <Typography variant="h5" fontWeight="bold" sx={{ color: 'white', fontSize: { xs: '1.25rem', md: '1.5rem' } }}>My Workspace</Typography>
              </CardActionArea>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={5}>
            <Card sx={{ height: '100%', border: '1px solid #FFD600' }}>
              <CardActionArea sx={{ height: '100%', p: { xs: 3, md: 4 }, textAlign: 'center' }} onClick={() => navigate('/admin', { replace: true })}>
                <DashboardIcon sx={{ fontSize: { xs: 50, md: 60 }, color: '#FFF', mb: 2 }} />
                <Typography variant="h5" fontWeight="bold" sx={{ color: 'white', fontSize: { xs: '1.25rem', md: '1.5rem' } }}>Admin Console</Typography>
              </CardActionArea>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </CenteredContainer>
  );
}

// ==========================================
// 4. CONNECTED WRAPPERS (Routing Logic)
// ==========================================

const ConnectedDashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const handleBack = user.accessLevel > 1 ? () => navigate('/mode-select') : null;
  return <Dashboard user={user} onLogout={onLogout} onBack={handleBack} />;
};

const ConnectedAdminConsole = ({ user }) => {
  const navigate = useNavigate();
  return <AdminConsole user={user} onBack={() => navigate('/mode-select')} />; 
};

// ==========================================
// 5. MAIN APP COMPONENT
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [isAppInitializing, setIsAppInitializing] = useState(true); 

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) setUser(docSnap.data());
        } catch (error) { console.error("Error fetching profile:", error); }
      } else {
        setUser(null);
      }
      setIsAppInitializing(false); 
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = () => { signOut(auth); setUser(null); };

  if (isAppInitializing) return <LoadingOverlay message="Restoring Session..." />;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Background />
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage onLogin={setUser} />} />
          
          <Route path="/mode-select" element={user ? <ModeSelectPage user={user} /> : <Navigate to="/" replace />} />
          
          {/* USER WORKSPACE ROUTE */}
          <Route path="/dashboard" element={user ? <ConnectedDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />} />
          
          {/* ADMIN CONSOLE ROUTE (Protected) */}
          <Route 
            path="/admin" 
            element={user && user.accessLevel > 1 ? <ConnectedAdminConsole user={user} /> : <Navigate to="/" replace />} 
          />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}