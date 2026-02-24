import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Typography, Paper, IconButton, Stack, Button, CircularProgress, 
  useTheme, Avatar, Chip, useMediaQuery, Dialog, DialogTitle, DialogContent, 
  DialogContentText, DialogActions, AppBar, Toolbar,
  List, ListItem, ListItemText, ListItemSecondaryAction, ListItemIcon, Tabs, Tab, Divider,
  TextField, MenuItem, Select, FormControl, InputLabel, LinearProgress, Menu, Snackbar, Alert
} from '@mui/material';
import { 
  ArrowBack as ArrowBackIcon, Refresh as RefreshIcon, WarningAmber as AlertIcon,
  Close as CloseIcon, PersonRemove as RemovePersonIcon, ArrowUpward as ArrowUpwardIcon, 
  ArrowDownward as ArrowDownwardIcon, FolderOpen as ProjectIcon, Group as GroupIcon, 
  Assignment as TaskIcon, Add as AddIcon, Description as LogIcon, History as HistoryIcon, 
  CreateNewFolder as AddProjectIcon, Logout as LogoutIcon,
  Edit as EditIcon, Delete as DeleteIcon, ManageAccounts as ReassignIcon,
  DeleteForever as DeleteUserIcon, Badge as BadgeIcon, 
  CalendarMonth as DateIcon, AdminPanelSettings as AdminIcon, Email as EmailIcon,
  OpenInFull as ViewAllIcon
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from './firebase';
import { getAuth, signOut } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc, addDoc, query, orderBy, limit, deleteDoc, where, writeBatch } from 'firebase/firestore';

// --- STYLED COMPONENTS ---
const BentoCard = ({ children, title, onClick, sx, action, accentColor = '#579DFF' }) => (
  <Paper 
    elevation={0}
    onClick={onClick}
    sx={{ 
      p: 2.5, bgcolor: '#121212', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column',
      cursor: onClick ? 'pointer' : 'default', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
      borderLeft: `4px solid ${accentColor}`, boxShadow: `0 4px 30px -5px ${accentColor}22`, 
      overflow: 'hidden', position: 'relative',
      '&:hover': onClick ? { transform: 'translateY(-4px) scale(1.01)', boxShadow: `0 10px 40px -5px ${accentColor}55`, zIndex: 10 } : {},
      ...sx
    }}
  >
    <Box sx={{ position: 'absolute', top: 0, right: 0, width: '150px', height: '150px', background: `radial-gradient(circle at top right, ${accentColor}15 0%, transparent 70%)`, pointerEvents: 'none' }} />
    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} sx={{ zIndex: 1 }}>
      {title && <Typography variant="subtitle2" sx={{ fontWeight: 800, color: accentColor, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1.5 }}>{title}</Typography>}
      {action}
    </Stack>
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>{children}</Box>
  </Paper>
);

const MetricBig = ({ value, label, color = '#fff', subtext }) => (
  <Box>
    <Typography variant="h2" fontWeight="900" sx={{ color: color, fontSize: { xs: '2.5rem', md: '3rem' }, lineHeight: 1, mb: 0.5, letterSpacing: -1 }}>{value}</Typography>
    <Typography variant="body2" sx={{ color: '#888', fontWeight: 600, fontSize: '0.85rem' }}>{label}</Typography>
    {subtext && <Typography variant="caption" sx={{ color: '#555', display: 'block', mt: 0.5, fontSize: '0.7rem', fontStyle: 'italic' }}>{subtext}</Typography>}
  </Box>
);

// --- TASK ROW COMPONENT ---
const TaskRow = ({ task, assignee, onReassign, onUnassign, onEdit, onDelete, isMobile }) => (
  <ListItem sx={{ bgcolor: '#111', mb: 2, borderRadius: 2, border: '1px solid #333' }}>
      <ListItemIcon sx={{ minWidth: 40 }}><TaskIcon sx={{ color: '#888' }} /></ListItemIcon>
      <ListItemText 
          primary={task.title} 
          secondary={
              <>
                  <Typography variant="caption" display="block" color="#9F8FEF">Due: {task.deadline || "No Date"}</Typography>
                  <Typography variant="caption" color="#888">{assignee ? `Assigned to: ${assignee.fullName}` : 'Unassigned'}</Typography>
              </>
          }
          primaryTypographyProps={{ color: '#fff', fontWeight: 500 }}
      />
      <ListItemSecondaryAction>
          <IconButton size={isMobile ? "small" : "medium"} onClick={(e) => onReassign(e, task)} sx={{ color: '#579DFF' }} title="Reassign"><ReassignIcon fontSize={isMobile ? "small" : "medium"} /></IconButton>
          {assignee && <IconButton size={isMobile ? "small" : "medium"} onClick={() => onUnassign(task.id)} sx={{ color: '#F87171' }} title="Unassign"><RemovePersonIcon fontSize={isMobile ? "small" : "medium"} /></IconButton>}
          <IconButton size={isMobile ? "small" : "medium"} onClick={() => onEdit(task)} sx={{ color: '#4BCE97' }} title="Edit"><EditIcon fontSize={isMobile ? "small" : "medium"} /></IconButton>
          <IconButton size={isMobile ? "small" : "medium"} onClick={() => onDelete(task.id)} sx={{ color: '#777' }} title="Delete"><DeleteIcon fontSize={isMobile ? "small" : "medium"} /></IconButton>
      </ListItemSecondaryAction>
  </ListItem>
);

// --- MAIN COMPONENT ---
export default function AdminConsole({ onBack, user: currentUser }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); 
  
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]); 
  const [projectsList, setProjectsList] = useState([]); 
  const [columns, setColumns] = useState([]); 
  const [loading, setLoading] = useState(true);

  // UI States
  const [viewLevel, setViewLevel] = useState(0); 
  const [selectedProjectName, setSelectedProjectName] = useState(null); 
  const [taskTab, setTaskTab] = useState(0); 
  
  // Dialog States
  const [openTaskDialog, setOpenTaskDialog] = useState(false);
  const [openProjectDialog, setOpenProjectDialog] = useState(false); 
  const [openLogDialog, setOpenLogDialog] = useState(false);
  const [openPendingDialog, setOpenPendingDialog] = useState(false);
  
  // --- DRILL DOWN STATES ---
  const [openFullRosterDialog, setOpenFullRosterDialog] = useState(false); // Layer 2: Full List
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);    // Layer 3: Profile Card

  // Custom Confirm & Alert
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', subtext: '', onConfirm: null });
  const [snackbar, setSnackbar] = useState({ open: false, msg: '', type: 'info' });

  // Editing & Reassigning
  const [isEditing, setIsEditing] = useState(false); 
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [reassignAnchorEl, setReassignAnchorEl] = useState(null);
  const [taskToReassign, setTaskToReassign] = useState(null);
  
  const [newTask, setNewTask] = useState({ title: '', project: '', assignedTo: '', priority: 'Medium', type: 'Video', description: '', dueDate: '' });
  const [newProjectName, setNewProjectName] = useState('');

  // --- OWNER CHECK ---
  const isOwner = currentUser?.role === 'Owner';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [userSnap, taskSnap, projSnap, logsSnap, colSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "tasks")),
        getDocs(collection(db, "projects")),
        getDocs(query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(200))),
        getDocs(query(collection(db, "columns"), orderBy("order", "asc")))
      ]);

      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjectsList(projSnap.docs.map(d => d.data().name));
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setColumns(colSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // --- UI HELPERS ---
  const showToast = (msg, type = 'info') => setSnackbar({ open: true, msg, type });
  const handleCloseSnackbar = () => setSnackbar({ ...snackbar, open: false });
  const triggerConfirm = (title, subtext, action) => {
    setConfirmDialog({ open: true, title, subtext, onConfirm: async () => { await action(); setConfirmDialog({ ...confirmDialog, open: false }); } });
  };

  // --- ACTIONS ---
  const handleLogout = () => { triggerConfirm("Logout?", "End session.", async () => { try { await signOut(getAuth()); } catch (error) { console.error("Logout failed", error); } }); };

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return;
    const normalizedName = newProjectName.toUpperCase(); 
    if (projectsList.includes(normalizedName)) { showToast("Project exists!", "error"); return; }
    try {
        await addDoc(collection(db, "projects"), { name: normalizedName, createdAt: new Date().toISOString() });
        setProjectsList([...projectsList, normalizedName]);
        setOpenProjectDialog(false); setNewProjectName('');
        showToast("Bucket Created", "success");
    } catch (error) { console.error(error); }
  };

  const handleSaveTask = async () => {
    if (!newTask.title || !newTask.assignedTo || !newTask.project) return showToast("Fields required.", "warning");
    try {
      const todoCol = columns.find(c => c.title && (c.title.toLowerCase().includes('to do') || c.title.toLowerCase().includes('todo')));
      const defaultStatus = todoCol ? todoCol.id : (columns.length > 0 ? columns[0].id : "todo");
      const taskPayload = { title: newTask.title, project: newTask.project, assignedTo: newTask.assignedTo, priority: newTask.priority, type: newTask.type, description: newTask.description, deadline: newTask.dueDate, weight: newTask.type === 'Video' ? 5 : 1 };

      if (isEditing && editingTaskId) {
        await updateDoc(doc(db, "tasks", editingTaskId), taskPayload);
        setTasks(tasks.map(t => t.id === editingTaskId ? { ...t, ...taskPayload } : t));
        showToast("Updated", "success");
      } else {
        const newPayload = { ...taskPayload, status: defaultStatus, progress: 0, createdAt: new Date().toISOString() };
        const docRef = await addDoc(collection(db, "tasks"), newPayload);
        setTasks([...tasks, { id: docRef.id, ...newPayload }]);
        showToast("Deployed", "success");
      }
      handleCloseTaskDialog();
    } catch (error) { console.error(error); }
  };

  const handleOpenCreateDialog = () => { setIsEditing(false); setNewTask({ title: '', project: '', assignedTo: '', priority: 'Medium', type: 'Video', description: '', dueDate: '' }); setOpenTaskDialog(true); };
  const handleOpenEditDialog = (task) => { setIsEditing(true); setEditingTaskId(task.id); setNewTask({ title: task.title, project: task.project || '', assignedTo: task.assignedTo || '', priority: task.priority || 'Medium', type: task.type || 'Video', description: task.description || '', dueDate: task.deadline || '' }); setOpenTaskDialog(true); };
  const handleCloseTaskDialog = () => { setOpenTaskDialog(false); setIsEditing(false); setEditingTaskId(null); setNewTask({ title: '', project: '', assignedTo: '', priority: 'Medium', type: 'Video', description: '', dueDate: '' }); };
  const handleOpenReassignMenu = (event, task) => { setReassignAnchorEl(event.currentTarget); setTaskToReassign(task); };
  const handleConfirmReassign = async (userId) => {
    if (!taskToReassign) return;
    try {
        await updateDoc(doc(db, "tasks", taskToReassign.id), { assignedTo: userId });
        setTasks(tasks.map(t => t.id === taskToReassign.id ? { ...t, assignedTo: userId } : t));
        setReassignAnchorEl(null); setTaskToReassign(null);
        showToast("Reassigned", "success");
    } catch (error) { console.error(error); }
  };

  const handleDeleteTask = (taskId) => {
    triggerConfirm("Delete Task?", "Permanently remove this task.", async () => {
        try {
            await deleteDoc(doc(db, "tasks", taskId));
            const batch = writeBatch(db);
            const logsQ = query(collection(db, "logs"), where("taskId", "==", taskId));
            const logsSnap = await getDocs(logsQ);
            logsSnap.forEach((logDoc) => { batch.delete(logDoc.ref); });
            await batch.commit();
            setTasks(tasks.filter(t => t.id !== taskId));
            showToast("Deleted", "info");
        } catch (error) { console.error(error); }
    });
  };

  const handleRemoveAssignee = (taskId) => {
    triggerConfirm("Unassign?", "Task moves to unassigned.", async () => {
      await updateDoc(doc(db, "tasks", taskId), { assignedTo: "" });
      setTasks(tasks.map(t => t.id === taskId ? { ...t, assignedTo: "" } : t));
      showToast("Unassigned", "info");
    });
  };

  // --- USER MANAGEMENT (OWNER ONLY) ---
  const handlePromoteUser = (user, e) => {
    if (e) e.stopPropagation(); 
    triggerConfirm(`Promote ${user.fullName}?`, "Make them Admin.", async () => {
        await updateDoc(doc(db, "users", user.id), { role: 'Admin', accessLevel: 2 });
        setUsers(users.map(u => u.id === user.id ? { ...u, role: 'Admin', accessLevel: 2 } : u));
        if (selectedUserProfile?.id === user.id) setSelectedUserProfile(prev => ({...prev, role: 'Admin', accessLevel: 2}));
        showToast("Promoted", "success");
    });
  };

  const handleDemoteUser = (user, e) => {
    if (e) e.stopPropagation();
    triggerConfirm(`Demote ${user.fullName}?`, "Remove Admin rights.", async () => {
        await updateDoc(doc(db, "users", user.id), { role: 'Member', accessLevel: 1 });
        setUsers(users.map(u => u.id === user.id ? { ...u, role: 'Member', accessLevel: 1 } : u));
        if (selectedUserProfile?.id === user.id) setSelectedUserProfile(prev => ({...prev, role: 'Member', accessLevel: 1}));
        showToast("Demoted", "info");
    });
  };

  const handleDeleteUser = (user) => {
    triggerConfirm(`Delete ${user.fullName}?`, "PERMANENTLY remove this user.", async () => {
        try {
            await deleteDoc(doc(db, "users", user.id));
            setUsers(users.filter(u => u.id !== user.id));
            setSelectedUserProfile(null); 
            showToast("User Removed", "warning");
        } catch (error) { console.error(error); showToast("Error deleting", "error"); }
    });
  };

  // --- DATA ---
  const activeTasksCount = tasks.filter(t => t.progress < 100).length;
  const highPriorityCount = tasks.filter(t => t.priority === 'High').length;
  const completionRate = tasks.length > 0 ? (tasks.filter(t => t.progress === 100).length / tasks.length) * 100 : 0;

  const yesterdayLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return logDate.getDate() === yesterday.getDate() && logDate.getMonth() === yesterday.getMonth();
  });

  const projectGroups = tasks.reduce((acc, task) => {
    const projName = task.project || "General"; 
    if (!acc[projName]) acc[projName] = [];
    acc[projName].push(task);
    return acc;
  }, {});

  const unifiedProjectList = projectsList.map(name => {
      const tasksInProj = projectGroups[name] || [];
      const done = tasksInProj.filter(t => t.progress === 100).length;
      return { name, total: tasksInProj.length, done, tasks: tasksInProj };
  }).sort((a, b) => b.total - a.total);

  const activityData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({ name: d.toLocaleDateString('en-US', { weekday: 'short' }), dateStr: d.toDateString(), value: 0 });
    }
    logs.forEach(log => {
        const logDate = new Date(log.timestamp).toDateString();
        const day = days.find(d => d.dateStr === logDate);
        if (day) day.value += 1;
    });
    return days;
  }, [logs]);

  // --- HELPER: RENDER USER ROW (UPDATED) ---
  // No Avatar, Smaller Font
  const renderUserRow = (u) => (
    <ListItem 
        key={u.id} 
        disableGutters 
        sx={{ py: 1, borderBottom: '1px solid #222', cursor: 'pointer', '&:hover': { bgcolor: '#222' }, borderRadius: 1, px: 1 }} 
        onClick={(e) => {
            e.stopPropagation(); 
            setSelectedUserProfile(u); 
        }} 
    >
        <ListItemText 
            primary={u.fullName} 
            secondary={u.designation} 
            primaryTypographyProps={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600 }} 
            secondaryTypographyProps={{ fontSize: '0.65rem', color: '#888' }} 
        />
        {/* ARROWS: Visible Only to Owner */}
        <Stack direction="row" spacing={0}>
            {isOwner && u.role === 'Member' && (
                <IconButton size="small" onClick={(e) => handlePromoteUser(u, e)} sx={{ color: '#FFD600', p: 0.5 }}>
                    <ArrowUpwardIcon fontSize="small" />
                </IconButton>
            )}
            {isOwner && u.role === 'Admin' && (
                <IconButton size="small" onClick={(e) => handleDemoteUser(u, e)} sx={{ color: '#FF9800', p: 0.5 }}>
                    <ArrowDownwardIcon fontSize="small" />
                </IconButton>
            )}
        </Stack>
    </ListItem>
  );

  return (
    <Box sx={{ height: { xs: 'auto', md: '100vh' }, minHeight: '100vh', width: '100%', bgcolor: '#000', color: '#fff', p: 2, fontFamily: '"Inter", sans-serif', display: 'flex', flexDirection: 'column', overflow: { xs: 'auto', md: 'hidden' } }}>
      
      {/* HEADER */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2} sx={{ flexShrink: 0 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton onClick={onBack} sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' }}><ArrowBackIcon /></IconButton>
          <Typography variant="h5" fontWeight="900" sx={{ letterSpacing: 1, fontSize: { xs: '1.2rem', md: '1.5rem' } }}>COMMAND <span style={{color: '#FFD600'}}>CENTER</span></Typography>
        </Stack>
        <Stack direction="row" spacing={0.5}> {/* Reduced spacing for mobile */}
          {isMobile ? (
            <>
              <IconButton size="small" onClick={() => setOpenProjectDialog(true)} sx={{ color: '#9F8FEF', border: '1px solid #9F8FEF' }}><AddProjectIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={handleOpenCreateDialog} sx={{ bgcolor: '#FFD600', color: '#000' }}><AddIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={fetchData} sx={{ color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}><RefreshIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={handleLogout} sx={{ color: '#FF5252', border: '1px solid #FF5252' }}><LogoutIcon fontSize="small" /></IconButton>
            </>
          ) : (
            <>
              <Button variant="outlined" sx={{ color: '#9F8FEF', borderColor: '#9F8FEF' }} startIcon={<AddProjectIcon />} onClick={() => setOpenProjectDialog(true)}>Bucket</Button>
              <Button variant="contained" sx={{ bgcolor: '#FFD600', color: '#000', fontWeight: 'bold' }} startIcon={<AddIcon />} onClick={handleOpenCreateDialog}>Assign</Button>
              <Button variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} startIcon={<RefreshIcon />} onClick={fetchData}>Sync</Button>
              <Button variant="outlined" sx={{ color: '#FF5252', borderColor: '#FF5252' }} onClick={handleLogout}><LogoutIcon /></Button>
            </>
          )}
        </Stack>
      </Stack>

      {loading ? ( <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress sx={{ color: '#FFD600' }} /></Box> ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 2fr 3fr 2fr 3fr' }, gap: 2, flexGrow: 1, height: '100%', width: '100%', gridAutoRows: { xs: 'minmax(200px, auto)', md: 'auto' } }}>
          {/* METRICS */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            <Box sx={{ flex: 1 }}><BentoCard title="Pending" accentColor="#579DFF" onClick={() => setOpenPendingDialog(true)} sx={{ cursor: 'pointer' }}><MetricBig value={activeTasksCount} label="Tasks" color="#579DFF" /><LinearProgress variant="determinate" value={100} sx={{ mt: 'auto', height: 4, borderRadius: 4, bgcolor: '#333', '& .MuiLinearProgress-bar': { bgcolor: '#579DFF' } }} /></BentoCard></Box>
            <Box sx={{ flex: 1 }}><BentoCard title="Critical" accentColor="#FF5252"><Stack direction="row" justifyContent="space-between"><MetricBig value={highPriorityCount} label="Urgent" color="#FF5252" /><AlertIcon sx={{ color: '#FF5252', fontSize: 32, opacity: 0.8 }} /></Stack></BentoCard></Box>
            <Box sx={{ flex: 1 }}><BentoCard title="Completed" accentColor="#00E676"><MetricBig value={`${Math.round(completionRate)}%`} label="Rate" color="#00E676" /><LinearProgress variant="determinate" value={completionRate} sx={{ mt: 'auto', height: 6, borderRadius: 4, bgcolor: '#333', '& .MuiLinearProgress-bar': { bgcolor: '#00E676' } }} /></BentoCard></Box>
          </Box>

          {/* SQUAD CARD (Layer 1: Preview List + Scalable Card) */}
          <Box sx={{ height: '100%' }}>
            <BentoCard 
                title="Squad" 
                accentColor="#FFD600"
                onClick={() => setOpenFullRosterDialog(true)} // LAYER 2 Trigger (Card Click)
                sx={{ cursor: 'pointer' }} // Visual cue for scaling
            >
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={1}><MetricBig value={users.length} label="Active" color="#FFD600" /><GroupIcon sx={{ color: '#FFD600', opacity: 0.5 }} /></Stack>
                <Divider sx={{ borderColor: 'rgba(255, 214, 0, 0.2)', my: 1 }} />
                
                {/* SHOW ONLY TOP 6 USERS */}
                <List dense sx={{ flexGrow: 1, overflowY: 'auto' }}>
                  {users.slice(0, 6).map((u) => renderUserRow(u))}
                </List>

                {/* VIEW ALL BUTTON (If > 6 users) */}
                {users.length > 6 && (
                    <Button 
                        fullWidth 
                        size="small" 
                        variant="text" 
                        sx={{ mt: 'auto', color: '#888', fontSize: '0.75rem', textTransform: 'none' }} 
                        endIcon={<ViewAllIcon fontSize="small"/>}
                    >
                        View All {users.length} Members
                    </Button>
                )}
            </BentoCard>
          </Box>

          {/* PROJECTS */}
          <Box sx={{ height: '100%' }}>
            <BentoCard title="Project Intel" accentColor="#9F8FEF" onClick={() => setViewLevel(1)} sx={{ cursor: 'pointer' }}>
                <Stack direction="row" alignItems="center" spacing={2} mb={3}><ProjectIcon sx={{ color: '#9F8FEF', fontSize: 32 }} /><Box><Typography variant="h3" fontWeight="bold" sx={{ color: '#fff', lineHeight: 1 }}>{unifiedProjectList.length}</Typography><Typography variant="caption" sx={{ color: '#9F8FEF' }}>Active Buckets</Typography></Box></Stack>
                <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>{unifiedProjectList.map((proj, i) => (<Box key={i} mb={2}><Stack direction="row" justifyContent="space-between" mb={0.5}><Typography variant="body2" color="#eee" noWrap>{proj.name}</Typography><Typography variant="caption" color="#9F8FEF">{proj.done}/{proj.total}</Typography></Stack><LinearProgress variant="determinate" value={proj.total > 0 ? (proj.done/proj.total)*100 : 0} sx={{ height: 6, borderRadius: 4, bgcolor: '#333', '& .MuiLinearProgress-bar': { bgcolor: '#9F8FEF' } }} /></Box>))}</Box>
            </BentoCard>
          </Box>

          {/* LOGS */}
          <Box sx={{ height: '100%' }}>
            <BentoCard title="Prior Log" accentColor="#FF9100" onClick={() => setOpenLogDialog(true)} sx={{ cursor: 'pointer' }}>
                 <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}><MetricBig value={yesterdayLogs.length} label="Recd" color="#FF9100" /><HistoryIcon sx={{ fontSize: 30, color: '#FF9100' }} /></Stack>
                 <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>{yesterdayLogs.slice(0,5).map((log, i) => (<Paper key={i} sx={{ p: 1, bgcolor: '#222', mb: 1, display: 'flex', alignItems: 'center', gap: 1, border: '1px solid #333' }}><Avatar sx={{ width: 20, height: 20, fontSize: 10, bgcolor: '#FF9100', color: '#000' }}>{log.userName?.[0]}</Avatar><Typography variant="caption" color="#ccc" noWrap>{log.userName}</Typography></Paper>))}</Box>
            </BentoCard>
          </Box>

          {/* VELOCITY */}
          <Box sx={{ height: '100%' }}>
               <BentoCard title="Velocity (7d)" accentColor="#06b6d4">
                  <Box sx={{ width: '100%', height: '100%', minHeight: 200, mt: 1 }}>
                    <ResponsiveContainer width="100%" height="100%"><BarChart data={activityData}><XAxis dataKey="name" stroke="#666" fontSize={10} tickLine={false} axisLine={false} /><YAxis hide /><Tooltip contentStyle={{ backgroundColor: '#222', border: '1px solid #444', borderRadius: 8, color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} /><Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={20} /></BarChart></ResponsiveContainer>
                  </Box>
               </BentoCard>
          </Box>
        </Box>
      )}

      {/* --- CONFIRMATION DIALOG --- */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ ...confirmDialog, open: false })} PaperProps={{ sx: { bgcolor: '#1A1D21', color: '#fff', border: '1px solid #333', borderRadius: 3, p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>{confirmDialog.title}</DialogTitle>
        <DialogContent><DialogContentText sx={{ color: '#aaa' }}>{confirmDialog.subtext}</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setConfirmDialog({ ...confirmDialog, open: false })} sx={{ color: '#888' }}>Cancel</Button><Button onClick={confirmDialog.onConfirm} variant="contained" sx={{ bgcolor: '#FF5252', color: 'white', '&:hover': { bgcolor: '#D32F2F' } }}>Confirm</Button></DialogActions>
      </Dialog>

      {/* --- SNACKBAR --- */}
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert onClose={handleCloseSnackbar} severity={snackbar.type} sx={{ width: '100%', borderRadius: 2 }}>{snackbar.msg}</Alert></Snackbar>

      {/* --- CREATE/EDIT DIALOGS (Existing) --- */}
      <Dialog open={openProjectDialog} onClose={() => setOpenProjectDialog(false)} PaperProps={{ sx: { bgcolor: '#1A1D21', color: '#fff', minWidth: 300, border: '1px solid #333' } }}>
         <DialogTitle>Add New Project</DialogTitle>
         <Box sx={{ p: 3 }}>
            <TextField label="Project Name" fullWidth variant="filled" sx={{ mb: 2, bgcolor: '#222', borderRadius: 1, input: {color:'white'}, label:{color:'grey'} }} value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
            <Button variant="contained" fullWidth sx={{ bgcolor: '#9F8FEF', color: '#000' }} onClick={handleAddProject}>Create Bucket</Button>
         </Box>
      </Dialog>

      <Dialog open={openTaskDialog} onClose={handleCloseTaskDialog} PaperProps={{ sx: { bgcolor: '#1A1D21', color: '#fff', minWidth: isMobile ? '90%' : 400, border: '1px solid #333' } }}>
        <DialogTitle sx={{ borderBottom: '1px solid #333' }}>{isEditing ? "Update Task" : "Assign New Task"}</DialogTitle>
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Task Title" fullWidth variant="filled" sx={{ bgcolor: '#222', borderRadius: 1, input: { color: '#fff' }, label: { color: '#888' } }} value={newTask.title} onChange={(e) => setNewTask({...newTask, title: e.target.value})} />
            <FormControl variant="filled" fullWidth sx={{ bgcolor: '#222', borderRadius: 1 }}><InputLabel sx={{ color: '#888' }}>Select Project</InputLabel><Select value={newTask.project} onChange={(e) => setNewTask({...newTask, project: e.target.value})} sx={{ color: '#fff' }}>{projectsList.map((p, i) => <MenuItem key={i} value={p}>{p}</MenuItem>)}</Select></FormControl>
            <FormControl variant="filled" fullWidth sx={{ bgcolor: '#222', borderRadius: 1 }}><InputLabel sx={{ color: '#888' }}>Assign To</InputLabel><Select value={newTask.assignedTo} onChange={(e) => setNewTask({...newTask, assignedTo: e.target.value})} sx={{ color: '#fff' }}>{users.map(u => <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>)}</Select></FormControl>
            <Stack direction="row" spacing={2}>
                <FormControl variant="filled" fullWidth sx={{ bgcolor: '#222', borderRadius: 1 }}><InputLabel sx={{ color: '#888' }}>Priority</InputLabel><Select value={newTask.priority} onChange={(e) => setNewTask({...newTask, priority: e.target.value})} sx={{ color: '#fff' }}>
                    <MenuItem value="Low">Low</MenuItem><MenuItem value="Medium">Medium</MenuItem><MenuItem value="High">High</MenuItem>
                </Select></FormControl>
                <FormControl variant="filled" fullWidth sx={{ bgcolor: '#222', borderRadius: 1 }}><InputLabel sx={{ color: '#888' }}>Type</InputLabel><Select value={newTask.type} onChange={(e) => setNewTask({...newTask, type: e.target.value})} sx={{ color: '#fff' }}><MenuItem value="Video">Video</MenuItem><MenuItem value="Poster">Poster</MenuItem></Select></FormControl>
            </Stack>
            <TextField label="Due Date" type="date" fullWidth variant="filled" InputLabelProps={{ shrink: true }} sx={{ bgcolor: '#222', borderRadius: 1, input: { color: '#fff' }, label: { color: '#888' } }} value={newTask.dueDate} onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})} />
            <TextField label="Description" fullWidth multiline rows={3} variant="filled" sx={{ bgcolor: '#222', borderRadius: 1, textarea: { color: '#fff' }, label: { color: '#888' } }} value={newTask.description} onChange={(e) => setNewTask({...newTask, description: e.target.value})} />
            <Button variant="contained" size="large" sx={{ bgcolor: '#FFD600', color: '#000', mt: 2, fontWeight: 'bold' }} onClick={handleSaveTask}>{isEditing ? "Update" : "Deploy"} Task</Button>
        </Box>
      </Dialog>

      {/* --- DRILL DOWN DIALOGS --- */}
      <Dialog open={openPendingDialog} onClose={() => setOpenPendingDialog(false)} fullScreen PaperProps={{ sx: { bgcolor: '#000', backgroundImage: 'none' } }}>
        <AppBar sx={{ position: 'relative', bgcolor: '#111', boxShadow: 'none', borderBottom: '1px solid #333' }}><Toolbar><IconButton edge="start" color="inherit" onClick={() => setOpenPendingDialog(false)}><CloseIcon /></IconButton><Typography sx={{ ml: 2, flex: 1 }} variant="h6">Active / Pending Tasks</Typography></Toolbar></AppBar>
        <Box sx={{ p: 3 }}><List sx={{ width: '100%', maxWidth: 800, mx: 'auto' }}>{tasks.filter(t => t.progress < 100).map(task => (<TaskRow key={task.id} task={task} assignee={users.find(u => u.id === task.assignedTo)} onUnassign={handleRemoveAssignee} onReassign={handleOpenReassignMenu} onEdit={handleOpenEditDialog} onDelete={handleDeleteTask} isMobile={isMobile} />))}</List></Box>
      </Dialog>

      <Dialog open={viewLevel === 1} onClose={() => setViewLevel(0)} fullScreen PaperProps={{ sx: { bgcolor: '#000', backgroundImage: 'none' } }}>
        <AppBar sx={{ position: 'relative', bgcolor: '#111', boxShadow: 'none', borderBottom: '1px solid #333' }}><Toolbar><IconButton edge="start" color="inherit" onClick={() => setViewLevel(0)}><CloseIcon /></IconButton><Typography sx={{ ml: 2, flex: 1 }} variant="h6">All Projects</Typography></Toolbar></AppBar>
        <Box sx={{ p: 4 }}><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 3 }}>{unifiedProjectList.map((proj, idx) => (<BentoCard key={idx} accentColor="#9F8FEF" onClick={() => { setSelectedProjectName(proj.name); setViewLevel(2); }}><Stack direction="row" justifyContent="space-between" mb={2}><ProjectIcon sx={{ color: '#9F8FEF' }} /><Chip label={`${proj.total} Tasks`} size="small" sx={{ bgcolor: 'rgba(159, 143, 239, 0.2)', color: '#9F8FEF' }} /></Stack><Typography variant="h6" fontWeight="bold" gutterBottom color="#fff">{proj.name}</Typography><LinearProgress variant="determinate" value={proj.total > 0 ? (proj.done/proj.total)*100 : 0} sx={{ mt: 2, height: 6, borderRadius: 3, bgcolor: '#333', '& .MuiLinearProgress-bar': { bgcolor: '#9F8FEF' } }} /></BentoCard>))}</Box></Box>
      </Dialog>

      <Dialog open={viewLevel === 2} onClose={() => setViewLevel(1)} fullScreen PaperProps={{ sx: { bgcolor: '#000', backgroundImage: 'none' } }}>
        <AppBar sx={{ position: 'relative', bgcolor: '#111', boxShadow: 'none', borderBottom: '1px solid #333' }}><Toolbar><IconButton edge="start" color="inherit" onClick={() => setViewLevel(1)}><ArrowBackIcon /></IconButton><Typography sx={{ ml: 2, flex: 1 }} variant="h6">{selectedProjectName}</Typography></Toolbar><Tabs value={taskTab} onChange={(e, v) => setTaskTab(v)} textColor="inherit" indicatorColor="secondary"><Tab label="In Progress" /><Tab label="Done" /></Tabs></AppBar>
        <Box sx={{ p: 3 }}><List sx={{ width: '100%', maxWidth: 800, mx: 'auto' }}>{selectedProjectName && unifiedProjectList.find(p => p.name === selectedProjectName)?.tasks.filter(t => (taskTab === 0 ? t.progress < 100 : t.progress === 100)).map(task => { const assignee = users.find(u => u.id === task.assignedTo); return (<TaskRow key={task.id} task={task} assignee={assignee} onUnassign={handleRemoveAssignee} onReassign={handleOpenReassignMenu} onEdit={handleOpenEditDialog} onDelete={handleDeleteTask} isMobile={isMobile} />)})}</List></Box>
      </Dialog>

      <Dialog open={openLogDialog} onClose={() => setOpenLogDialog(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#1A1D21', color: '#fff', border: '1px solid #333' } }}>
        <DialogTitle sx={{ borderBottom: '1px solid #333' }}>Yesterday's Work Logs</DialogTitle>
        <Box sx={{ p: 0 }}><List>{yesterdayLogs.map((log) => (<ListItem key={log.id} sx={{ borderBottom: '1px solid #333', alignItems: 'flex-start', py: 2 }}><ListItemIcon><LogIcon sx={{ color: '#FF9100', mt: 0.5 }} /></ListItemIcon><ListItemText primary={log.userName} secondary={<><Typography variant="caption" display="block" color="#999" sx={{ mb: 0.5 }}>{new Date(log.timestamp).toLocaleString()}</Typography><Typography variant="body2" color="#ccc">{log.content}</Typography></>} primaryTypographyProps={{ color: '#fff', fontWeight: 'bold' }} /></ListItem>))}</List></Box>
      </Dialog>

      {/* --- LAYER 2: FULL ROSTER DIALOG --- */}
      <Dialog open={openFullRosterDialog} onClose={() => setOpenFullRosterDialog(false)} fullScreen PaperProps={{ sx: { bgcolor: '#000', backgroundImage: 'none' } }}>
        <AppBar sx={{ position: 'relative', bgcolor: '#111', boxShadow: 'none', borderBottom: '1px solid #333' }}><Toolbar><IconButton edge="start" color="inherit" onClick={() => setOpenFullRosterDialog(false)}><CloseIcon /></IconButton><Typography sx={{ ml: 2, flex: 1 }} variant="h6">Team Roster ({users.length})</Typography></Toolbar></AppBar>
        <Box sx={{ p: 3 }}>
            <List sx={{ width: '100%', maxWidth: 800, mx: 'auto' }}>
                {users.map((u) => renderUserRow(u))}
            </List>
        </Box>
      </Dialog>

      {/* --- LAYER 3: USER PROFILE POPUP (With Email & Delete) --- */}
      <Dialog open={Boolean(selectedUserProfile)} onClose={() => setSelectedUserProfile(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: '#1E1E1E', color: '#fff', borderRadius: 4, border: '1px solid #333' } }}>
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            <IconButton onClick={() => setSelectedUserProfile(null)} sx={{ position: 'absolute', top: 10, right: 10, color: '#888' }}><CloseIcon /></IconButton>
            
            <Avatar sx={{ width: 80, height: 80, bgcolor: selectedUserProfile?.role === 'Owner' ? '#FFD600' : '#579DFF', color: '#000', fontSize: 32, mb: 2 }}>{selectedUserProfile?.fullName?.[0]}</Avatar>
            <Typography variant="h5" fontWeight="bold">{selectedUserProfile?.fullName}</Typography>
            
            {/* Added Email Display Here */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3, color: 'text.secondary' }}>
                <EmailIcon fontSize="small" />
                <Typography variant="body2">{selectedUserProfile?.email}</Typography>
            </Stack>

            <Stack spacing={2} width="100%">
                <Paper sx={{ p: 2, bgcolor: '#111', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <BadgeIcon sx={{ color: '#888' }} />
                    <Box><Typography variant="caption" color="textSecondary">Employee ID</Typography><Typography variant="body2">{selectedUserProfile?.employeeId || "N/A"}</Typography></Box>
                </Paper>
                <Paper sx={{ p: 2, bgcolor: '#111', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <AdminIcon sx={{ color: '#888' }} />
                    <Box><Typography variant="caption" color="textSecondary">System Role</Typography><Typography variant="body2">{selectedUserProfile?.role}</Typography></Box>
                </Paper>
                <Paper sx={{ p: 2, bgcolor: '#111', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <DateIcon sx={{ color: '#888' }} />
                    <Box><Typography variant="caption" color="textSecondary">Joined</Typography><Typography variant="body2">{selectedUserProfile?.createdAt ? new Date(selectedUserProfile.createdAt).toLocaleDateString() : "Unknown"}</Typography></Box>
                </Paper>
            </Stack>

            {/* OWNER ONLY DELETE BUTTON */}
            {isOwner && selectedUserProfile?.id !== currentUser.uid && (
                <Button 
                    variant="contained" 
                    color="error" 
                    startIcon={<DeleteUserIcon />} 
                    fullWidth
                    onClick={() => handleDeleteUser(selectedUserProfile)}
                    sx={{ mt: 4 }}
                >
                    Delete Profile
                </Button>
            )}
        </Box>
      </Dialog>

      <Menu anchorEl={reassignAnchorEl} open={Boolean(reassignAnchorEl)} onClose={() => setReassignAnchorEl(null)}>
        {users.map(u => <MenuItem key={u.id} onClick={() => handleConfirmReassign(u.id)}>{u.fullName}</MenuItem>)}
      </Menu>

    </Box>
  );
}