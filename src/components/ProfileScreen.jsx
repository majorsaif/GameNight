import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function ProfileScreen() {
  const navigate = useNavigate();
  const { user, updateProfile, logout } = useAuth();
  const fileInputRef = useRef(null);
  
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(user?.displayName || '');
  const [showComingSoon, setShowComingSoon] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Generate initials from nickname
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Generate consistent color from name
  const getAvatarColor = (name) => {
    if (!name) return 'bg-purple-600';
    const colors = [
      'bg-purple-600',
      'bg-blue-600',
      'bg-pink-600',
      'bg-indigo-600',
      'bg-violet-600',
      'bg-fuchsia-600',
      'bg-cyan-600',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Format member since date
  const formatMemberSince = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Handle nickname update
  const handleNicknameSave = () => {
    if (nicknameInput.trim()) {
      updateProfile({ displayName: nicknameInput.trim() });
      setIsEditingNickname(false);
    }
  };

  // Handle nickname cancel
  const handleNicknameCancel = () => {
    setNicknameInput(user?.displayName || '');
    setIsEditingNickname(false);
  };

  // Handle avatar change
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateProfile({ avatar: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle link account (show coming soon)
  const handleLinkAccount = (provider) => {
    setShowComingSoon(true);
    setTimeout(() => setShowComingSoon(false), 2000);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <header className="bg-[#16213e] border-b border-[#2a3f5f] px-6 py-4 flex items-center justify-start gap-4">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-white transition-colors flex items-center justify-center"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-white font-bold text-lg leading-none">Profile</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-6 py-8 space-y-8">
          
          {/* Profile Header */}
          <div className="flex flex-col items-center text-center space-y-3">
            {/* Avatar */}
            <div className="relative">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-4 border-purple-600/30"
                />
              ) : (
                <div className={`w-24 h-24 rounded-full ${getAvatarColor(user.displayName)} flex items-center justify-center text-white text-3xl font-bold border-4 border-purple-600/30`}>
                  {getInitials(user.displayName)}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-slate-700 hover:bg-slate-600 text-white rounded-full p-2 shadow-lg transition-colors"
              >
                <span className="material-symbols-outlined text-sm">photo_camera</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            {/* Nickname */}
            {isEditingNickname ? (
              <div className="w-full space-y-2">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  className="w-full bg-[#16213e] border border-purple-600 rounded-lg px-4 py-2 text-white text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleNicknameCancel}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleNicknameSave}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-white text-2xl font-bold">{user.displayName}</h2>
                <button
                  onClick={() => setIsEditingNickname(true)}
                  className="text-slate-400 hover:text-purple-400 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">edit</span>
                </button>
              </div>
            )}

            {/* Member Since */}
            <p className="text-slate-500 text-sm">
              Member since {formatMemberSince(user.memberSince)}
            </p>
          </div>

          {/* Link Account Section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-white font-bold text-sm uppercase tracking-wide mb-1">
                Link Account
              </h3>
            </div>
            
            <div className="space-y-2">
              {/* Google */}
              <button
                onClick={() => handleLinkAccount('google')}
                disabled
                className="w-full bg-[#16213e] border border-[#2a3f5f] rounded-xl p-4 flex items-center gap-3 text-slate-500 cursor-not-allowed opacity-60"
              >
                <svg viewBox="0 0 24 24" className="w-6 h-6">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-sm font-medium">Continue with Google</span>
              </button>

              {/* Apple */}
              <button
                onClick={() => handleLinkAccount('apple')}
                disabled
                className="w-full bg-[#16213e] border border-[#2a3f5f] rounded-xl p-4 flex items-center gap-3 text-slate-500 cursor-not-allowed opacity-60"
              >
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                <span className="text-sm font-medium">Continue with Apple</span>
              </button>

              {/* Email */}
              <button
                onClick={() => handleLinkAccount('email')}
                disabled
                className="w-full bg-[#16213e] border border-[#2a3f5f] rounded-xl p-4 flex items-center gap-3 text-slate-500 cursor-not-allowed opacity-60"
              >
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span className="text-sm font-medium">Continue with Email</span>
              </button>
            </div>
          </div>

          {/* Logout Section */}
          <div className="border-t border-[#2a3f5f] pt-6">
            <button
              onClick={handleLogout}
              className="w-full bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 hover:border-red-600 rounded-xl p-4 flex items-center justify-center gap-3 text-red-400 hover:text-red-300 transition-all"
            >
              <span className="material-symbols-outlined">logout</span>
              <span className="font-medium">Log Out</span>
            </button>
          </div>

        </div>
      </div>

      {/* Coming Soon Toast */}
      {showComingSoon && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-white px-6 py-3 rounded-lg shadow-xl animate-fade-in z-50">
          <p className="text-sm font-medium">Coming soon! 🚀</p>
        </div>
      )}
    </div>
  );
}

export default ProfileScreen;
