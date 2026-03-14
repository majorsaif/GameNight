import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  compressProfilePhotoFile,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_UPLOAD_BYTES
} from '../utils/photoCompression';

const PHOTO_KEY = 'gamenight_photo';

export default function ProfileModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user, updateProfile, logout } = useAuth();
  const fileInputRef = useRef(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.displayName || '');

  // Sync name input whenever the modal opens or the display name changes externally
  useEffect(() => {
    if (isOpen) {
      setNameInput(user?.displayName || '');
      setIsEditingName(false);
    }
  }, [isOpen, user?.displayName]);

  const handleLogout = () => {
    onClose();
    logout();
    navigate('/onboarding');
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

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
    return colors[name.charCodeAt(0) % colors.length];
  };

  const handleNameSave = () => {
    if (nameInput.trim()) {
      updateProfile({ displayName: nameInput.trim() });
      setIsEditingName(false);
    }
  };

  const handleNameCancel = () => {
    setNameInput(user?.displayName || '');
    setIsEditingName(false);
  };

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

      localStorage.setItem(PHOTO_KEY, dataUrl);
      updateProfile({ photo: dataUrl });
    } catch (error) {
      console.error('Error compressing profile modal photo:', error);
      alert('Failed to process photo. Please choose a different image.');
    }

    // Clear the input so the same file can be re-selected
    e.target.value = '';
  };

  const handleAvatarRemove = () => {
    updateProfile({ photo: null });
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Centred card */}
      <div
        className={`relative w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl shadow-black/80 transition-transform duration-200 ease-out ${isOpen ? 'scale-100' : 'scale-95'}`}
      >
        {/* Header row */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-white font-bold text-lg">Profile</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close profile"
          >
            <span className="material-symbols-outlined text-xl leading-none">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 space-y-6">

          {/* Avatar + name section */}
          <div className="flex flex-col items-center gap-4 pt-2">

            {/* Avatar */}
            <div className="relative">
              {user?.photo ? (
                <div className="relative">
                  <img
                    src={user.photo}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover border-4 border-violet-600/30"
                  />
                  <button
                    onClick={handleAvatarRemove}
                    className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 shadow-lg transition-colors"
                    aria-label="Remove photo"
                  >
                    <span className="material-symbols-outlined text-sm leading-none">close</span>
                  </button>
                </div>
              ) : (
                <div className={`w-20 h-20 rounded-full ${getAvatarColor(user?.displayName)} flex items-center justify-center text-white text-2xl font-bold border-4 border-violet-600/30`}>
                  {getInitials(user?.displayName)}
                </div>
              )}
              {/* Camera button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 bg-slate-700 hover:bg-slate-600 text-white rounded-full p-1.5 shadow-lg transition-colors"
                aria-label="Change photo"
              >
                <span className="material-symbols-outlined text-sm leading-none">photo_camera</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            {/* Display name */}
            {isEditingName ? (
              <div className="w-full space-y-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSave();
                    if (e.key === 'Escape') handleNameCancel();
                  }}
                  className="w-full bg-slate-800 border border-violet-600 rounded-xl px-4 py-2 text-white text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleNameCancel}
                    className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleNameSave}
                    disabled={!nameInput.trim()}
                    className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-bold transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="flex items-center gap-2 group"
                title="Edit display name"
              >
                <span className="text-white text-xl font-bold">{user?.displayName}</span>
                <span className="material-symbols-outlined text-base text-slate-500 group-hover:text-violet-400 transition-colors">edit</span>
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-800" />

          {/* Log out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 bg-red-900/25 hover:bg-red-900/45 border border-red-700/50 hover:border-red-600/70 rounded-2xl p-4 text-red-400 hover:text-red-300 font-medium transition-all"
          >
            <span className="material-symbols-outlined text-xl leading-none">logout</span>
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
