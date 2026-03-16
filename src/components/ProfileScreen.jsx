import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  compressProfilePhotoFile,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_UPLOAD_BYTES
} from '../utils/photoCompression';

function ProfileScreen() {
  const navigate = useNavigate();
  const { user, updateProfile, logout } = useAuth();
  const fileInputRef = useRef(null);
  
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(user?.displayName || '');

  const handleLogout = () => {
    logout();
    navigate('/onboarding');
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
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > PROFILE_PHOTO_MAX_UPLOAD_BYTES) {
      alert('Photo size must be less than 15MB');
      return;
    }

    try {
      const { dataUrl } = await compressProfilePhotoFile(file, {
        maxBytes: PROFILE_PHOTO_MAX_BYTES
      });
      updateProfile({ photo: dataUrl });
    } catch (error) {
      console.error('Error compressing profile photo:', error);
      alert('Failed to process photo. Please choose a different image.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle avatar remove
  const handleAvatarRemove = () => {
    updateProfile({ photo: null });
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
              {user.photo ? (
                <div className="relative group">
                  <img
                    src={user.photo}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover border-4 border-purple-600/30"
                  />
                  <button
                    onClick={handleAvatarRemove}
                    className="absolute top-0 right-0 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
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

            {/* Member Since - Removed */}
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
    </div>
  );
}

export default ProfileScreen;
