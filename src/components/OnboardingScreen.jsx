import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getInitials } from '../utils/avatar';
import GameNightLogo from './GameNightLogo';
import {
  compressProfilePhotoFile,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_UPLOAD_BYTES
} from '../utils/photoCompression';

export default function OnboardingScreen() {
  const [name, setName] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handlePhotoChange = async (e) => {
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

      localStorage.setItem('gamenight_photo', dataUrl);
      console.log('[Profile] Saved photo to localStorage, key: gamenight_photo, length:', dataUrl.length);

      setPhotoPreview(dataUrl);
      setPhotoBase64(dataUrl);
    } catch (error) {
      console.error('Error compressing onboarding photo:', error);
      alert('Failed to process photo. Please choose a different image.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    setPhotoBase64(null);
    localStorage.removeItem('gamenight_photo');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Save to localStorage
    localStorage.setItem('gamenight_nickname', name.trim());
    if (photoBase64) {
      localStorage.setItem('gamenight_photo', photoBase64);
      console.log('[Profile] Saved photo to localStorage, key: gamenight_photo, length:', photoBase64.length);
    }

    // Return to an invite room when onboarding was triggered from a room link.
    const redirectTo = location.state?.redirectTo;
    navigate(typeof redirectTo === 'string' ? redirectTo : '/');
  };

  // Generate initials avatar color
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 flex justify-center">
          <GameNightLogo size="hero" />
        </div>

        {/* Onboarding Card */}
        <div className="bg-slate-900/50 backdrop-blur-sm border-2 border-slate-700 rounded-3xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Preview */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                {photoPreview ? (
                  <div className="relative">
                    <img
                      src={photoPreview}
                      alt="Profile preview"
                      className="w-24 h-24 rounded-full object-cover border-4 border-purple-600/30"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ) : name.trim() ? (
                  <div className={`w-24 h-24 rounded-full ${getAvatarColor(name)} flex items-center justify-center text-white text-3xl font-bold border-4 border-purple-600/30`}>
                    {getInitials(name)}
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-4xl border-4 border-slate-600/30">
                    <span className="material-symbols-outlined text-4xl">person</span>
                  </div>
                )}
              </div>

              {/* Photo Upload Button */}
              {!photoPreview && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-violet-400 hover:text-violet-300 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">add_photo_alternate</span>
                  Add a photo (optional)
                </button>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>

            {/* Name Input */}
            <div className="space-y-2">
              <label htmlFor="name" className="block text-slate-300 text-sm font-medium text-center">
                What should we call you?
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                autoFocus
                className="w-full px-6 py-4 bg-slate-800 border-2 border-slate-700 hover:border-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 rounded-xl text-white placeholder-slate-500 text-center text-lg font-semibold outline-none transition-all"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full px-6 py-4 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl shadow-lg shadow-purple-900/50 hover:shadow-xl hover:shadow-purple-800/60 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
            >
              Let's Play
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
