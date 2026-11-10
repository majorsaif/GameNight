import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { colorForUid, getInitials } from '../utils/avatar';
import GameNightLogo from './GameNightLogo';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { MAX_NAME_LENGTH } from '../lib/profiles';
import {
  compressProfilePhotoFile,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_UPLOAD_BYTES
} from '../utils/photoCompression';

export default function OnboardingScreen() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName || '');
  const [photoPreview, setPhotoPreview] = useState(user?.photo || null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = typeof location.state?.redirectTo === 'string' ? location.state.redirectTo : '/';

  useEffect(() => {
    document.title = 'Get started | Its Games Night';
  }, []);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > PROFILE_PHOTO_MAX_UPLOAD_BYTES) {
      toast.error('That photo is too big. Pick one under 15MB.');
      return;
    }

    try {
      const { dataUrl } = await compressProfilePhotoFile(file, { maxBytes: PROFILE_PHOTO_MAX_BYTES });
      setPhotoPreview(dataUrl);
    } catch (error) {
      console.error('Error compressing onboarding photo:', error);
      toast.error("Couldn't use that photo. Try a different image.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateProfile({ displayName: name, photo: photoPreview || null });
    // Back to the invite link that brought them here, if any
    navigate(redirectTo, { replace: true });
  };

  const getAvatarColor = () => colorForUid(name.trim().toLowerCase());

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
                      aria-label="Remove photo"
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
                maxLength={MAX_NAME_LENGTH}
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
        <p className="text-center text-slate-500 text-xs mt-6">
          No sign-up needed. Your name and photo stay on this device and in the rooms you join.{' '}
          <Link to="/privacy" className="underline hover:text-slate-300">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
