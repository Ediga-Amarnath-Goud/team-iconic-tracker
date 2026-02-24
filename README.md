# TeamIconic Tracker

A full-stack team management and performance tracking system built using React and Firebase.

## 🚀 Live Demo

Deployed on Netlify  
🔗 https://team-iconic-tracker.netlify.app

## ✨ Features

- Role-based access control (Owner, Admin, Member)
- Secure authentication (Email & Google OAuth)
- Real-time Kanban board with drag-and-drop
- Admin console with analytics and activity logs
- Firestore-based structured data management
- Batch operations and transactional updates
- Invite-code based registration control
- Responsive UI for desktop and mobile
- Cloudinary integration for media uploads

## 🛠 Tech Stack

Frontend:
- React.js
- Material UI

Backend & Database:
- Firebase Authentication
- Firestore Database

Deployment:
- Netlify

Other Tools:
- Git & GitHub
- Cloudinary

## 🔐 Architecture Overview

- Role-based access is managed using access levels stored in Firestore.
- Conditional rendering ensures feature restriction based on user roles.
- Firestore transactions are used for safe user registration.
- Real-time listeners keep dashboard and Kanban board synchronized.
- Admin console allows role management and activity tracking.

## 📦 Installation

1. Clone the repository
2. Run `npm install`
3. Create a `.env` file with Firebase credentials
4. Run `npm start`