import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  Box, Typography, Paper, IconButton, Button, Dialog, 
  DialogContent, DialogTitle, DialogActions, DialogContentText, Stack, Menu, MenuItem, Avatar,
  InputBase, TextField, GlobalStyles, Slider, Chip, Snackbar, Alert,
  Checkbox, FormControlLabel, Switch, Tooltip, CircularProgress,
  Select, FormControl, InputLabel, useTheme, useMediaQuery, Tabs, Tab
} from '@mui/material';
import { 
  Add as AddIcon, MoreHoriz as MoreIcon, AccessTime as ClockIcon,
  ChatBubbleOutline as CommentIcon, Close as CloseIcon, Subject as DescriptionIcon,
  DeleteOutline as DeleteIcon, CalendarMonth as DateIcon, ReportProblem as QueryIcon,
  Warning as AlertIcon, CheckCircle as CheckIcon, Link as LinkIcon,
  CloudUpload as UploadIcon, VideoLibrary as VideoIcon, Image as ImageIcon,
  AdminPanelSettings as AdminIcon, Person as PersonIcon, AssignmentInd as AssignIcon,
  Visibility as ViewIcon, ArrowBack as ArrowBackIcon, History as HistoryIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { db } from './firebase'; 
import { 
  collection, query, orderBy, onSnapshot, where, getDocs,
  doc, updateDoc, addDoc, deleteDoc, serverTimestamp, arrayUnion, writeBatch 
} from 'firebase/firestore';

const BACKGROUND_IMAGE = 'url("https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=3270&auto=format&fit=crop")';

const THEME = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
  colors: {
    listBg: '#101204', cardBg: '#22272B', textPrimary: '#B6C2CF', textWhite: '#FFFFFF',
    accentBlue: '#579DFF', accentGreen: '#4BCE97', accentPurple: '#9F8FEF',
    accentRed: '#FF5252', modalBg: '#2A2E33', panelBg: '#1A1D21'
  }
};

export default function Dashboard({ user, onLogout, onBack }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); 
  
  // Refs
  const scrollContainerRef = useRef(null); 
  const isDraggingRef = useRef(false);
  const pointerXRef = useRef(null);
  const autoScrollFrameRef = useRef(null);

  const hasAdminPrivileges = user.accessLevel > 1; 
  const [adminView, setAdminView] = useState(hasAdminPrivileges);
  const isEffectiveAdmin = hasAdminPrivileges && adminView;

  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]); 
  const [projects, setProjects] = useState([]); 
  
  const [openModal, setOpenModal] = useState(false); 
  const [openCreateModal, setOpenCreateModal] = useState(false); 
  const [selectedTask, setSelectedTask] = useState(null);
  const [localProgress, setLocalProgress] = useState(0); 
  const [anchorEl, setAnchorEl] = useState(null); 
  const [labelAnchorEl, setLabelAnchorEl] = useState(null); 
  const [selectedColId, setSelectedColId] = useState(null);
  const [newColTitle, setNewColTitle] = useState('');
  const [isAddingCol, setIsAddingCol] = useState(false);
  const [toast, setToast] = useState({ open: false, msg: '', type: 'info' });
  const [isUploading, setIsUploading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', subtext: '', onConfirm: null });

  const [modalTab, setModalTab] = useState(0);

  const [createTitle, setCreateTitle] = useState("");
  const [createAssignee, setCreateAssignee] = useState("");
  const [createProject, setCreateProject] = useState(""); 
  const [targetColumnId, setTargetColumnId] = useState(null);
  const [newLog, setNewLog] = useState("");
  const [isQuery, setIsQuery] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [videoLinkInput, setVideoLinkInput] = useState("");

  // --- HELPER FUNCTIONS ---
  const showToast = useCallback((msg, type = 'success') => setToast({ open: true, msg, type }), []);
  const handleToastClose = () => setToast({ ...toast, open: false });

  const triggerConfirm = (title, subtext, action) => {
    setConfirmDialog({ 
      open: true, title, subtext, 
      onConfirm: async () => { await action(); setConfirmDialog({ ...confirmDialog, open: false }); }
    });
  };

  // =========================================================
  // 1. ROBUST SCROLL ENGINE (Native & Drag)
  // =========================================================

  // A. Native Horizontal Scroll via Mouse Wheel (Desktop)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el && !isMobile) {
      const onWheel = (e) => {
        if (e.deltaY === 0) return;
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }
  }, [isMobile]);

  // B. Tracker for Auto-Scroll (Mobile Dragging)
  // We track the pointer globally, but we DO NOT prevent default behavior here.
  useEffect(() => {
    const handleMove = (e) => {
      // Capture X coordinate from Touch or Mouse
      if (e.touches && e.touches[0]) {
        pointerXRef.current = e.touches[0].clientX;
      } else if (e.clientX) {
        pointerXRef.current = e.clientX;
      }
    };

    window.addEventListener('touchmove', handleMove, { passive: true }); // Passive ensures we don't break native scroll
    window.addEventListener('mousemove', handleMove, { passive: true });

    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mousemove', handleMove);
    };
  }, []);

  // C. The "Game Loop" for Auto-Scroll
  // This loop runs continuously but only does work if (isDragging && nearEdge)
  useEffect(() => {
    const scrollLoop = () => {
      if (isDraggingRef.current && pointerXRef.current !== null && scrollContainerRef.current) {
        const x = pointerXRef.current;
        const width = window.innerWidth;
        const edgeZone = 100; // 100px activation zone
        
        let velocity = 0;

        if (x < edgeZone) {
          // Left Scroll: Closer to 0 = Faster
          // normalize (0 to 1) -> 1 is closest to edge
          const intensity = (edgeZone - x) / edgeZone; 
          velocity = -1 * (10 + (intensity * 35)); // Base speed 10, max added 35 = 45px/frame
        } else if (x > width - edgeZone) {
          // Right Scroll
          const intensity = (x - (width - edgeZone)) / edgeZone;
          velocity = (10 + (intensity * 35));
        }

        if (velocity !== 0) {
          scrollContainerRef.current.scrollLeft += velocity;
        }
      }
      autoScrollFrameRef.current = requestAnimationFrame(scrollLoop);
    };

    // Start loop
    autoScrollFrameRef.current = requestAnimationFrame(scrollLoop);

    return () => {
      if (autoScrollFrameRef.current) cancelAnimationFrame(autoScrollFrameRef.current);
    };
  }, []);

  // =========================================================
  // DATA FETCHING
  // =========================================================

  useEffect(() => {
    const q = query(collection(db, "columns"), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snap) => setColumns(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let q = isEffectiveAdmin ? query(collection(db, "tasks")) : query(collection(db, "tasks"), where("assignedTo", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snap) => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsubscribe();
  }, [user, isEffectiveAdmin]);

  useEffect(() => {
    const fetchData = async () => {
      if (hasAdminPrivileges) {
        const snap = await getDocs(collection(db, "users"));
        setAllEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      const projSnap = await getDocs(collection(db, "projects"));
      setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchData();
  }, [hasAdminPrivileges]);

  // =========================================================
  // DRAG HANDLERS
  // =========================================================

  const onDragStart = () => {
    isDraggingRef.current = true; // Engage Scroll Engine
  };

  const onDragEnd = async (result) => {
    isDraggingRef.current = false; // Disengage Scroll Engine

    const { destination, source, draggableId, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return; // Deadline sort enforced

    if (type === "COLUMN") {
      if (!isEffectiveAdmin) return; 
      const newColumns = Array.from(columns);
      const [removed] = newColumns.splice(source.index, 1);
      newColumns.splice(destination.index, 0, removed);
      setColumns(newColumns); 
      const batch = writeBatch(db);
      newColumns.forEach((col, index) => { batch.update(doc(db, "columns", col.id), { order: index }); });
      await batch.commit();
      return;
    }

    const finalColumnId = columns[columns.length - 1]?.id;
    if (!isEffectiveAdmin && source.droppableId === finalColumnId) {
      showToast("🔒 Task is locked. Contact Admin.", "error");
      return;
    }

    const updatedTasks = tasks.map(t => t.id === draggableId ? { ...t, status: destination.droppableId } : t);
    setTasks(updatedTasks);
    
    const updatePayload = { status: destination.droppableId };
    if (destination.droppableId === finalColumnId) {
        updatePayload.completedAt = new Date().toISOString();
        updatePayload.progress = 100;
        showToast("🚀 Task Completed!");
    } else if (source.droppableId === finalColumnId) {
        updatePayload.completedAt = null;
    }
    await updateDoc(doc(db, "tasks", draggableId), updatePayload);
  };

  // =========================================================
  // MODAL & ACTION HANDLERS
  // =========================================================

  const handleOpenCreateModal = (columnId) => {
    setTargetColumnId(columnId); setCreateTitle(""); setCreateAssignee(user.uid); setCreateProject(""); setOpenCreateModal(true);
  };

  const submitNewTask = async () => {
    if (!createTitle.trim()) return;
    await addDoc(collection(db, "tasks"), {
      title: createTitle, status: targetColumnId, assignedTo: createAssignee, 
      project: createProject || "General", createdBy: user.uid, description: "", 
      createdAt: serverTimestamp(), type: "Video", priority: "Normal", 
      deadline: new Date().toISOString(), logs: [], progress: 0, weight: 5, checklist: [], videoLink: "", imageLink: ""
    });
    showToast(`Task assigned`); setOpenCreateModal(false);
  };

  const handleAddColumn = async () => {
    if (newColTitle.trim()) {
      await addDoc(collection(db, "columns"), { title: newColTitle, createdAt: serverTimestamp(), order: columns.length });
      setNewColTitle(''); setIsAddingCol(false);
    }
  };

  const handleDeleteColumn = async () => {
    if(selectedColId) {
        triggerConfirm("Delete List?", "This action cannot be undone.", async () => {
            await deleteDoc(doc(db, "columns", selectedColId)); 
            showToast("List deleted");
        });
    }
    setAnchorEl(null);
  };

  const openTaskModal = (task) => {
    setSelectedTask(task); setLocalProgress(task.progress || 0); setModalTab(0); 
    setVideoLinkInput(task.videoLink || ""); setOpenModal(true);
  };

  const getListName = (colId) => columns.find(c => c.id === colId)?.title || "Unknown List";

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast("File too large (Max 10MB)", "error"); return; }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const cloudName = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME || "YOUR_CLOUD_NAME"; 
      const uploadPreset = process.env.REACT_APP_CLOUDINARY_PRESET || "YOUR_UPLOAD_PRESET"; 
      formData.append("upload_preset", uploadPreset); 

      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: formData });
      if (!response.ok) throw new Error("Cloudinary Upload Failed");

      const data = await response.json();
      const downloadURL = data.secure_url; 

      await updateDoc(doc(db, "tasks", selectedTask.id), { imageLink: downloadURL });
      setSelectedTask({ ...selectedTask, imageLink: downloadURL });
      showToast("Image Uploaded!");
    } catch (error) { console.error("Upload Error:", error); showToast("Upload failed", "error"); } finally { setIsUploading(false); }
  };

  const handleDeleteImage = async () => {
    if (!selectedTask?.imageLink) return;
    triggerConfirm("Remove Image?", "This will delete the image link.", async () => {
        try {
            await updateDoc(doc(db, "tasks", selectedTask.id), { imageLink: null });
            setSelectedTask(prev => ({ ...prev, imageLink: null }));
            showToast("Image removed");
        } catch (error) { showToast("Failed to remove image", "error"); }
    });
  };

  const addLog = async () => {
    if (!newLog.trim()) return;
    const logEntry = { text: newLog, user: user.fullName, timestamp: new Date().toISOString(), type: isQuery ? "QUERY" : "LOG" };
    await updateDoc(doc(db, "tasks", selectedTask.id), { logs: arrayUnion(logEntry) });
    await addDoc(collection(db, "logs"), { 
        text: newLog, userName: user.fullName, userId: user.uid, 
        timestamp: new Date().toISOString(), type: "TASK_UPDATE", projectId: selectedTask.project || 'General', taskId: selectedTask.id 
    });
    setSelectedTask(prev => ({ ...prev, logs: [...(prev.logs || []), logEntry] }));
    setNewLog(""); setIsQuery(false); showToast(isQuery ? "⚠️ Query Raised" : "Log submitted");
  };

  const addChecklistItem = async () => {
    if (!newCheckItem.trim()) return;
    const newItem = { id: Date.now(), text: newCheckItem, isCompleted: false };
    await updateDoc(doc(db, "tasks", selectedTask.id), { checklist: arrayUnion(newItem) });
    setSelectedTask(prev => ({ ...prev, checklist: [...(prev.checklist || []), newItem] }));
    setNewCheckItem("");
  };
  const toggleCheckItem = async (itemId) => {
    const updatedChecklist = selectedTask.checklist.map(item => item.id === itemId ? { ...item, isCompleted: !item.isCompleted } : item);
    await updateDoc(doc(db, "tasks", selectedTask.id), { checklist: updatedChecklist });
    setSelectedTask(prev => ({ ...prev, checklist: updatedChecklist }));
  };
  const deleteCheckItem = async (item) => {
    const updatedChecklist = selectedTask.checklist.filter(i => i.id !== item.id);
    await updateDoc(doc(db, "tasks", selectedTask.id), { checklist: updatedChecklist });
    setSelectedTask(prev => ({ ...prev, checklist: updatedChecklist }));
  };
  const saveVideoLink = async () => {
    await updateDoc(doc(db, "tasks", selectedTask.id), { videoLink: videoLinkInput });
    setSelectedTask(prev => ({ ...prev, videoLink: videoLinkInput })); showToast("Link Saved");
  };
  const handleSliderChange = (e, newValue) => setLocalProgress(newValue);
  const handleSliderCommit = async (e, newValue) => {
    await updateDoc(doc(db, "tasks", selectedTask.id), { progress: newValue });
    setSelectedTask(prev => ({ ...prev, progress: newValue }));
  };

  const updateLabel = async (type) => {
    const weight = type === 'Video' ? 5 : 1; 
    await updateDoc(doc(db, "tasks", selectedTask.id), { type, weight });
    setSelectedTask(prev => ({ ...prev, type, weight })); setLabelAnchorEl(null);
  };
  const togglePriority = async () => {
    const newPriority = selectedTask.priority === 'High' ? 'Normal' : 'High';
    await updateDoc(doc(db, "tasks", selectedTask.id), { priority: newPriority });
    setSelectedTask(prev => ({ ...prev, priority: newPriority }));
  };
  const updateDeadline = async (e) => {
    if (!e.target.value) return;
    await updateDoc(doc(db, "tasks", selectedTask.id), { deadline: e.target.value });
    setSelectedTask(prev => ({ ...prev, deadline: e.target.value })); showToast("Deadline updated");
  };

  const handleDeleteTask = async () => {
    triggerConfirm("Delete Card?", "Permanently delete this card and its history?", async () => {
      try {
        const batch = writeBatch(db);
        const taskRef = doc(db, "tasks", selectedTask.id);
        batch.delete(taskRef);
        const logsQ = query(collection(db, "logs"), where("taskId", "==", selectedTask.id));
        const logsSnap = await getDocs(logsQ);
        logsSnap.forEach((logDoc) => { batch.delete(logDoc.ref); });
        await batch.commit();
        setOpenModal(false); 
        showToast("Card & History deleted");
      } catch (error) { console.error(error); showToast("Error deleting task", "error"); }
    });
  };

  const hasActiveQuery = (taskLogs) => taskLogs?.length > 0 && taskLogs[taskLogs.length - 1].type === 'QUERY';

  return (
    <Box sx={{ 
        height: '100vh', 
        width: '100vw', 
        display: 'flex', 
        flexDirection: 'column', 
        backgroundImage: BACKGROUND_IMAGE, 
        backgroundSize: 'cover', 
        backgroundPosition: 'center', 
        fontFamily: THEME.fontFamily,
        overflow: 'hidden', 
        position: 'fixed' // Prevents mobile browser UI expansion
    }}>
      <GlobalStyles styles={{ '*': { boxSizing: 'border-box', fontFamily: THEME.fontFamily }, '::-webkit-scrollbar': { height: '10px', width: '10px' }, '::-webkit-scrollbar-track': { background: 'rgba(0,0,0,0.1)' }, '::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: '5px' } }} />

      {/* HEADER */}
      <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', bgcolor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', width: '100%' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          {hasAdminPrivileges && (
             <IconButton onClick={onBack} sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}><ArrowBackIcon /></IconButton>
          )}
          {!isMobile && <Typography variant="h6" fontWeight="bold" sx={{ color: '#fff', px: 1 }}>Iconic</Typography>}
          {!isMobile && <Button variant="contained" sx={{ bgcolor: '#dfe1e6', color: '#172b4d', fontWeight: 'bold', height: 32 }}>Board</Button>}
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
           {hasAdminPrivileges && (
             <Stack direction="row" alignItems="center" spacing={1} sx={{ bgcolor: 'rgba(0,0,0,0.4)', borderRadius: 4, px: 2, py: 0.5 }}>
               {adminView ? <AdminIcon sx={{ color: '#579DFF', fontSize: 20 }} /> : <PersonIcon sx={{ color: '#4BCE97', fontSize: 20 }} />}
               {!isMobile && <Typography variant="caption" sx={{ color: '#fff', fontWeight: 'bold' }}>{adminView ? "Admin View" : "My Tasks"}</Typography>}
               <Switch size="small" checked={adminView} onChange={(e) => setAdminView(e.target.checked)} color="primary"/>
             </Stack>
           )}
           <Avatar sx={{ width: 28, height: 28, bgcolor: '#0052CC', border: '2px solid #fff' }}>{user.fullName[0]}</Avatar>
           <IconButton onClick={onLogout} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
        </Stack>
      </Box>

      {/* BOARD (Mouse Drag & Auto Scroll Enabled) */}
      <Box 
        ref={scrollContainerRef}
        sx={{ 
            flexGrow: 1, 
            overflowX: 'auto', 
            overflowY: 'hidden',
            p: 2, 
            width: '100%', 
            scrollBehavior: 'smooth',
            WebkitOverflowScrolling: 'touch', // Crucial for native mobile scroll
            display: 'flex', 
            alignItems: 'flex-start'
        }}
      >
        <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart}>
          <Droppable droppableId="board" direction="horizontal" type="COLUMN">
            {(provided) => (
              <Stack 
                ref={provided.innerRef} 
                {...provided.droppableProps} 
                direction="row" 
                spacing={1.5} 
                sx={{ height: '100%', alignItems: 'flex-start', minWidth: 'fit-content' }}
              >
                {columns.map((column, index) => {
                  const isFirstColumn = index === 0;
                  
                  // --- SORTING LOGIC: NEAREST DEADLINE TOP ---
                  const columnTasks = tasks
                    .filter(t => t.status === column.id || (isFirstColumn && t.status === 'todo'))
                    .sort((a, b) => {
                        if (a.deadline && !b.deadline) return -1;
                        if (!a.deadline && b.deadline) return 1;
                        if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
                        return 0;
                    });

                  return (
                    <Draggable key={column.id} draggableId={column.id} index={index} isDragDisabled={!isEffectiveAdmin}>
                      {(provided, snapshot) => (
                        <Paper ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} elevation={0}
                          sx={{ 
                            bgcolor: THEME.colors.listBg, 
                            minWidth: isMobile ? '85vw' : 280, 
                            width: isMobile ? '85vw' : 280, 
                            p: 1.5, pb: 1, borderRadius: '12px', 
                            maxHeight: '85vh', 
                            border: '1px solid rgba(255,255,255,0.08)', 
                            display: 'flex', flexDirection: 'column', 
                            transform: snapshot.isDragging ? 'rotate(2deg)' : 'none'
                          }}>
                          <Stack direction="row" justifyContent="space-between" mb={1} px={0.5}>
                            <Typography fontWeight="600" sx={{ fontSize: '0.95rem', color: THEME.colors.textWhite, pl: 1 }}>{column.title}</Typography>
                            {isEffectiveAdmin && <IconButton size="small" onClick={(e) => { setAnchorEl(e.currentTarget); setSelectedColId(column.id); }} sx={{ color: THEME.colors.textPrimary }}><MoreIcon fontSize="small" /></IconButton>}
                          </Stack>
                          <Droppable droppableId={column.id} type="TASK">
                            {(provided) => (
                              <Box ref={provided.innerRef} {...provided.droppableProps} sx={{ flexGrow: 1, overflowY: 'auto', px: 0.5, minHeight: 10, className: 'custom-scroll' }}>
                                {columnTasks.map((task, index) => (
                                  <Draggable key={task.id} draggableId={task.id} index={index}>
                                    {(provided, snapshot) => (
                                      <Paper ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => openTaskModal(task)}
                                        sx={{ 
                                          bgcolor: THEME.colors.cardBg, color: THEME.colors.textPrimary, p: '10px 12px', mb: 1, borderRadius: '8px', 
                                          boxShadow: snapshot.isDragging ? '0 5px 15px rgba(0,0,0,0.3)' : '0px 1px 1px rgba(0,0,0,0.1)', 
                                          border: hasActiveQuery(task.logs) ? `1px solid ${THEME.colors.accentRed}` : '1px solid rgba(255,255,255,0.05)',
                                          position: 'relative', '&:hover': { border: `1px solid ${THEME.colors.accentBlue}`, cursor: 'pointer', transform: 'translateY(-2px)' }, transition: 'all 0.2s',
                                          touchAction: 'none' // Important for drag
                                        }}>
                                         <Stack direction="row" justifyContent="space-between" mb={1}>
                                            <Stack direction="row" spacing={0.5}>
                                                <Box sx={{ width: 40, height: 6, borderRadius: 4, bgcolor: task.type === 'Video' ? THEME.colors.accentGreen : THEME.colors.accentPurple }} />
                                                {task.priority === 'High' && <Box sx={{ width: 40, height: 6, borderRadius: 4, bgcolor: '#F87168' }} />}
                                            </Stack>
                                            {hasActiveQuery(task.logs) ? <AlertIcon sx={{ fontSize: 14, color: THEME.colors.accentRed }} /> : <Tooltip title="Assigned to you" arrow><AssignIcon sx={{ fontSize: 14, color: '#444' }}/></Tooltip>}
                                         </Stack>
                                         <Typography variant="body2" fontWeight="500" sx={{ color: '#fff', mb: 1, fontSize: isMobile ? '0.85rem' : '0.9rem' }}>{task.title}</Typography>
                                         <Stack direction="row" spacing={1.5} alignItems="center" sx={{ opacity: 0.7 }}>
                                            {task.deadline && (
                                              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: '#B6C2CF', bgcolor: new Date(task.deadline) < new Date() ? 'rgba(248, 113, 104, 0.2)' : 'transparent', p: '0px 4px', borderRadius: 1 }}>
                                                  <ClockIcon sx={{ fontSize: 12 }} /><Typography variant="caption" sx={{ fontSize: 11 }}>{format(new Date(task.deadline), 'MMM d')}</Typography>
                                              </Stack>
                                            )}
                                            {(task.checklist && task.checklist.length > 0) && <Stack direction="row" alignItems="center" spacing={0.5}><CheckIcon sx={{ fontSize: 12 }} /><Typography variant="caption" sx={{ fontSize: 11 }}>{task.checklist.filter(i=>i.isCompleted).length}/{task.checklist.length}</Typography></Stack>}
                                            {(task.logs && task.logs.length > 0) && <Stack direction="row" alignItems="center" spacing={0.5}><CommentIcon sx={{ fontSize: 12 }} /><Typography variant="caption" sx={{ fontSize: 11 }}>{task.logs.length}</Typography></Stack>}
                                         </Stack>
                                      </Paper>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </Box>
                            )}
                          </Droppable>
                          {isEffectiveAdmin && <Button startIcon={<AddIcon />} fullWidth onClick={() => handleOpenCreateModal(column.id)} sx={{ color: '#9FADBC', justifyContent: 'flex-start', mt: 1, textTransform: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' } }}>Add a card</Button>}
                        </Paper>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
                {isEffectiveAdmin && !isAddingCol && <Button startIcon={<AddIcon />} onClick={() => setIsAddingCol(true)} sx={{ minWidth: 280, height: 50, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', justifyContent: 'flex-start', p: 2, borderRadius: 3, textTransform: 'none', backdropFilter: 'blur(4px)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>Add another list</Button>}
                {isAddingCol && <Paper sx={{ minWidth: 280, p: 1, bgcolor: '#101204', borderRadius: 3, height: 'fit-content' }}><InputBase autoFocus fullWidth placeholder="List title..." value={newColTitle} onChange={(e) => setNewColTitle(e.target.value)} sx={{ bgcolor: '#222', color: '#fff', p: 1, borderRadius: 1, mb: 1, border: `2px solid ${THEME.colors.accentBlue}` }} /><Stack direction="row" spacing={1}><Button variant="contained" size="small" onClick={handleAddColumn}>Add list</Button><IconButton size="small" onClick={() => setIsAddingCol(false)} sx={{ color: '#9FADBC' }}><CloseIcon /></IconButton></Stack></Paper>}
              </Stack>
            )}
          </Droppable>
        </DragDropContext>
      </Box>

      {/* --- CONFIRMATION DIALOG --- */}
      <Dialog 
        open={confirmDialog.open} 
        onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}
        PaperProps={{ sx: { bgcolor: '#2A2E33', color: '#fff', border: '1px solid #444', borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>{confirmDialog.title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: '#aaa' }}>{confirmDialog.subtext}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ ...confirmDialog, open: false })} sx={{ color: '#888' }}>Cancel</Button>
          <Button onClick={confirmDialog.onConfirm} variant="contained" sx={{ bgcolor: '#FF5252', color: 'white', '&:hover': { bgcolor: '#D32F2F' } }}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* --- MODALS --- */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}><MenuItem onClick={handleDeleteColumn} sx={{ color: '#AE2E24' }}>Delete List</MenuItem></Menu>
      <Menu anchorEl={labelAnchorEl} open={Boolean(labelAnchorEl)} onClose={() => setLabelAnchorEl(null)}><MenuItem onClick={() => updateLabel('Video')} sx={{ color: '#4BCE97' }}>Video</MenuItem><MenuItem onClick={() => updateLabel('Poster')} sx={{ color: '#9F8FEF' }}>Poster</MenuItem></Menu>
      <Snackbar open={toast.open} autoHideDuration={3000} onClose={handleToastClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert onClose={handleToastClose} severity={toast.type} sx={{ width: '100%', borderRadius: 2 }}>{toast.msg}</Alert></Snackbar>

      <Dialog open={openCreateModal} onClose={() => setOpenCreateModal(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: '#2A2E33', color: '#fff', borderRadius: 2 } }}>
         <DialogTitle>Create New Task</DialogTitle>
         <DialogContent>
            <Stack spacing={2} mt={1}>
              <TextField autoFocus label="Task Title" fullWidth variant="outlined" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} sx={{ input: { color: '#fff' }, label: { color: '#aaa' }, fieldset: { borderColor: '#555' } }} />
              <FormControl fullWidth><InputLabel sx={{ color: '#aaa' }}>Select Project</InputLabel><Select value={createProject} label="Select Project" onChange={(e) => setCreateProject(e.target.value)} sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' }, '.MuiSvgIcon-root': { color: '#fff' } }}><MenuItem value=""><em>None (General)</em></MenuItem>{projects.map((proj) => <MenuItem key={proj.id} value={proj.name}>{proj.name}</MenuItem>)}</Select></FormControl>
              <FormControl fullWidth><InputLabel sx={{ color: '#aaa' }}>Assign To</InputLabel><Select value={createAssignee} label="Assign To" onChange={(e) => setCreateAssignee(e.target.value)} sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' }, '.MuiSvgIcon-root': { color: '#fff' } }}><MenuItem value={user.uid}>Myself</MenuItem>{allEmployees.filter(emp => emp.id !== user.uid).map(emp => (<MenuItem key={emp.id} value={emp.id}>{emp.fullName || "Unknown"} ({emp.email})</MenuItem>))}</Select></FormControl>
            </Stack>
         </DialogContent>
         <DialogActions><Button onClick={() => setOpenCreateModal(false)} sx={{ color: '#aaa' }}>Cancel</Button><Button onClick={submitNewTask} variant="contained" disabled={!createTitle.trim()}>Create</Button></DialogActions>
      </Dialog>

      {/* --- TASK DETAILS MODAL (With Tabs & Mobile Visibility Fix) --- */}
      <Dialog 
        open={openModal} 
        onClose={() => setOpenModal(false)} 
        fullScreen={isMobile} 
        maxWidth="lg" 
        fullWidth 
        PaperProps={{ sx: { bgcolor: THEME.colors.modalBg, color: '#DCDFE4', borderRadius: isMobile ? 0 : 2, height: isMobile ? '100%' : '85vh', maxWidth: '1100px' } }}
      >
         <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header / Tabs */}
            <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#22252A' }}>
                {isMobile ? (
                    <Tabs value={modalTab} onChange={(e, v) => setModalTab(v)} textColor="inherit" indicatorColor="primary">
                        <Tab label="Project Overview" icon={<DescriptionIcon fontSize="small" />} iconPosition="start" />
                        <Tab label="Log Submission" icon={<HistoryIcon fontSize="small" />} iconPosition="start" />
                    </Tabs>
                ) : (
                    <Typography variant="h6" sx={{ ml: 2, fontWeight: 'bold', color: '#fff' }}>{selectedTask?.title}</Typography>
                )}
                <IconButton onClick={() => setOpenModal(false)} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
            </Box>

            {/* Content Body */}
            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100%', overflow: 'hidden' }}>
               
               {/* SECTION 1: PROJECT OVERVIEW (Left on Desktop, Tab 0 on Mobile) */}
               {(!isMobile || modalTab === 0) && (
                   <Box sx={{ flex: isMobile ? '1' : '0 0 65%', p: isMobile ? 2 : 4, borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)', overflowY: 'auto' }}>
                      
                      {/* --- METADATA HEADER (Visible on Mobile & Desktop) --- */}
                      <Stack direction={isMobile ? "column" : "row"} justifyContent="space-between" alignItems="flex-start" mb={2} spacing={isMobile ? 2 : 0}>
                          <Box>
                              {/* Title on Mobile */}
                              {isMobile && <Typography variant="h5" fontWeight="bold" color="white" gutterBottom>{selectedTask?.title}</Typography>}
                              
                              {selectedTask?.project && <Chip label={selectedTask.project} size="small" sx={{ bgcolor: 'rgba(159, 143, 239, 0.2)', color: '#9F8FEF', mb: 1 }} />}
                              
                              <Stack direction={isMobile ? "column" : "row"} spacing={2} alignItems={isMobile ? "flex-start" : "center"}>
                                  <Typography variant="body2" color="textSecondary">in list <u>{getListName(selectedTask?.status)}</u></Typography>
                                  
                                  {/* Action Buttons / Chips */}
                                  <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                                      {isEffectiveAdmin && (
                                      <>
                                          <Chip label="Labels" size="small" onClick={(e) => setLabelAnchorEl(e.currentTarget)} sx={{ cursor: 'pointer', bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' }} />
                                          <Chip label={selectedTask?.priority === 'High' ? 'High Priority' : 'Priority'} size="small" color={selectedTask?.priority === 'High' ? 'error' : 'default'} onClick={togglePriority} sx={{ cursor: 'pointer' }} />
                                          <Chip label="Archive" size="small" onDelete={handleDeleteTask} deleteIcon={<DeleteIcon />} sx={{ bgcolor: 'rgba(255, 82, 82, 0.1)', color: '#FF5252' }} />
                                      </>
                                      )}
                                      <Button size="small" startIcon={<DateIcon />} sx={{ color: selectedTask?.deadline && new Date(selectedTask.deadline) < new Date() ? '#FF5252' : '#9FADBC', bgcolor: 'rgba(255,255,255,0.05)', position: 'relative', pointerEvents: isEffectiveAdmin ? 'auto' : 'none' }}>
                                          {selectedTask?.deadline ? format(new Date(selectedTask.deadline), 'MMM d') : "Set Date"} 
                                          {isEffectiveAdmin && <input type="date" onChange={updateDeadline} style={{ position: 'absolute', opacity: 0, top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer' }} />}
                                      </Button>
                                  </Stack>
                              </Stack>
                          </Box>
                      </Stack>

                      <Box mb={5}>
                        <Typography variant="h6" fontWeight="bold" sx={{ color: '#fff', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}><DescriptionIcon color="primary" /> Description & Changes</Typography>
                        {selectedTask?.description && (
                            <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Typography variant="body2" sx={{ color: '#DCDFE4', whiteSpace: 'pre-wrap' }}>{selectedTask.description}</Typography>
                            </Paper>
                        )}
                        <Stack spacing={1} mb={2}>
                        {selectedTask?.checklist?.map((item) => (
                            <Paper key={item.id} sx={{ p: 1, px: 2, bgcolor: THEME.colors.panelBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <FormControlLabel control={<Checkbox checked={item.isCompleted} onChange={() => toggleCheckItem(item.id)} sx={{ color: '#579DFF', '&.Mui-checked': { color: '#4BCE97' } }} />} label={<Typography sx={{ textDecoration: item.isCompleted ? 'line-through' : 'none', color: item.isCompleted ? '#666' : '#fff' }}>{item.text}</Typography>} />
                                {isEffectiveAdmin && <IconButton size="small" onClick={() => deleteCheckItem(item)}><CloseIcon fontSize="small" sx={{ color: '#666' }} /></IconButton>}
                            </Paper>
                        ))}
                        </Stack>
                        {isEffectiveAdmin && <Paper sx={{ p: '2px 4px', display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.05)', border: '1px dashed #555' }}><InputBase sx={{ ml: 1, flex: 1, color: '#ccc', fontSize: '0.9rem' }} placeholder="+ Add changes required..." value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()} /><IconButton onClick={addChecklistItem} sx={{ color: '#579DFF' }}><AddIcon /></IconButton></Paper>}
                      </Box>

                      <Box mb={4}>
                        <Typography variant="h6" fontWeight="bold" sx={{ color: '#fff', mb: 2 }}>Media & Assets</Typography>
                        <Paper sx={{ p: 3, bgcolor: THEME.colors.panelBg, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
                            {selectedTask?.type === 'Video' ? (
                            <Stack spacing={2}>
                                <Stack direction="row" spacing={1} alignItems="center" color="#4BCE97"><VideoIcon /><Typography variant="subtitle2">Video Task</Typography></Stack>
                                <TextField fullWidth placeholder="Paste Video Link here..." value={videoLinkInput} onChange={(e) => setVideoLinkInput(e.target.value)} variant="outlined" size="small" sx={{ input: { color: '#fff' }, fieldset: { borderColor: '#444' } }} />
                                <Stack direction="row" justifyContent="flex-end">
                                    {selectedTask?.videoLink && <Button startIcon={<LinkIcon/>} href={selectedTask.videoLink} target="_blank" sx={{ mr: 1 }}>Open Link</Button>}
                                    <Button variant="contained" onClick={saveVideoLink} disabled={!videoLinkInput}>Save Link</Button>
                                </Stack>
                            </Stack>
                            ) : (
                            <Stack spacing={2} alignItems="center" justifyContent="center">
                                {selectedTask?.imageLink ? (
                                    <Box sx={{ width: '100%', borderRadius: 2, overflow: 'hidden', border: '1px solid #444', bgcolor: '#000' }}>
                                        <Tooltip title="Click to view full quality">
                                        <img src={selectedTask.imageLink} alt="Task Asset" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', cursor: 'zoom-in', display: 'block' }} onClick={() => window.open(selectedTask.imageLink, '_blank')} />
                                        </Tooltip>
                                        <Stack direction="row" spacing={1} justifyContent="center" sx={{ p: 1.5, bgcolor: '#2A2E33', borderTop: '1px solid #444' }}>
                                        <Button size="small" variant="contained" startIcon={<ViewIcon />} onClick={() => window.open(selectedTask.imageLink, '_blank')} sx={{ bgcolor: THEME.colors.accentBlue }}>View</Button>
                                        <Button component="label" size="small" variant="outlined" startIcon={isUploading ? <CircularProgress size={16}/> : <UploadIcon />} sx={{ color: '#B6C2CF', borderColor: '#555' }}>
                                            {isUploading ? "Wait" : "Replace"}
                                            <input hidden accept="image/*" type="file" onChange={handleImageUpload} />
                                        </Button>
                                        <Button size="small" variant="outlined" startIcon={<DeleteIcon />} onClick={handleDeleteImage} sx={{ color: THEME.colors.accentRed, borderColor: THEME.colors.accentRed, '&:hover': { bgcolor: 'rgba(255, 82, 82, 0.1)', borderColor: THEME.colors.accentRed } }}>Delete</Button>
                                        </Stack>
                                    </Box>
                                ) : (
                                    <Box sx={{ p: 4, width: '100%', border: '2px dashed #444', borderRadius: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                        <ImageIcon sx={{ fontSize: 40, color: '#555' }} />
                                        <Typography color="textSecondary">High Quality Image Upload</Typography>
                                        <Button variant="contained" startIcon={isUploading ? <CircularProgress size={20} color="inherit"/> : <UploadIcon />} component="label">
                                        {isUploading ? "Uploading..." : "Upload File"} 
                                        <input hidden accept="image/*" type="file" onChange={handleImageUpload} />
                                        </Button>
                                    </Box>
                                )}
                            </Stack>
                            )}
                        </Paper>
                      </Box>
                   </Box>
               )}

               {/* SECTION 2: LOG SUBMISSION (Right on Desktop, Tab 1 on Mobile) */}
               {(!isMobile || modalTab === 1) && (
                   <Box sx={{ flex: isMobile ? '1' : '0 0 35%', bgcolor: '#22252A', display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                         <Box sx={{ mb: 3 }}>
                            <Stack direction="row" justifyContent="space-between" mb={0.5}><Typography variant="caption" color="textSecondary">TASK COMPLETION</Typography><Typography variant="caption" color="primary" fontWeight="bold">{localProgress}%</Typography></Stack>
                            <Slider value={localProgress} onChange={handleSliderChange} onChangeCommitted={handleSliderCommit} sx={{ color: '#579DFF', height: 6 }} />
                         </Box>
                         <Typography variant="h6" sx={{ color: '#fff', mb: 2 }}>Log Submission</Typography>
                         <TextField fullWidth multiline rows={3} placeholder="Write a log entry..." value={newLog} onChange={(e) => setNewLog(e.target.value)} sx={{ bgcolor: '#2A2E33', borderRadius: 1, mb: 2, '& .MuiOutlinedInput-root': { color: '#fff' } }} />
                         <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Button variant="contained" onClick={addLog} disabled={!newLog.trim()} sx={{ bgcolor: isQuery ? THEME.colors.accentRed : THEME.colors.accentBlue }}>{isQuery ? "Submit Query" : "Submit Log"}</Button>
                            <Button startIcon={<QueryIcon />} onClick={() => setIsQuery(!isQuery)} sx={{ color: isQuery ? '#FF5252' : '#666', bgcolor: isQuery ? 'rgba(255,82,82,0.1)' : 'transparent' }}>Flag Query</Button>
                         </Stack>
                      </Box>
                      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
                         {selectedTask?.logs?.slice().reverse().map((log, i) => (
                            <Box key={i} sx={{ mb: 2, p: 2, bgcolor: log.type === 'QUERY' ? 'rgba(255, 82, 82, 0.05)' : '#2A2E33', borderRadius: 2, borderLeft: `3px solid ${log.type === 'QUERY' ? '#FF5252' : '#579DFF'}` }}>
                               <Stack direction="row" justifyContent="space-between" mb={1}><Typography variant="subtitle2" color="white" fontWeight="bold">{log.user}</Typography><Typography variant="caption" color="textSecondary">{format(new Date(log.timestamp), 'MMM d, h:mm a')}</Typography></Stack>
                               <Typography variant="body2" color="#ccc">{log.text}</Typography>
                            </Box>
                         ))}
                         {(!selectedTask?.logs || selectedTask.logs.length === 0) && <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 4 }}>No activity yet.</Typography>}
                      </Box>
                   </Box>
               )}
            </DialogContent>
         </Box>
      </Dialog>
    </Box>
  );
}