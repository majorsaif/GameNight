import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Camera, Trash2 } from 'lucide-react';
import { colorForUid } from '../utils/avatar';
import GameNightLogo from './GameNightLogo';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { MAX_NAME_LENGTH } from '../lib/profiles';
import {
  compressProfilePhotoFile,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_UPLOAD_BYTES
} from '../utils/photoCompression';
import { Avatar, Button, Input, Screen } from '../ui';

export default function OnboardingScreen() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName || '');
  const [photoPreview, setPhotoPreview] = useState(user?.photo || null);
  const [photoBusy, setPhotoBusy] = useState(false);
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

    setPhotoBusy(true);
    try {
      const { dataUrl } = await compressProfilePhotoFile(file, { maxBytes: PROFILE_PHOTO_MAX_BYTES });
      setPhotoPreview(dataUrl);
    } catch (error) {
      console.error('Error compressing onboarding photo:', error);
      toast.error("Couldn't use that photo. Try a different image.");
    } finally {
      setPhotoBusy(false);
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

  const trimmed = name.trim();

  return (
    <Screen center>
      <form onSubmit={handleSubmit} className="flex animate-enter flex-col items-center py-8">
        <GameNightLogo size="hero" />
        <h1 className="mt-8 text-center text-2xl font-semibold text-ink">What should we call you?</h1>
        <p className="mt-2 text-center text-base text-ink-muted">This is how other players will see you.</p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Avatar
            size="2xl"
            name={trimmed || '?'}
            photo={photoPreview}
            color={trimmed ? colorForUid(trimmed.toLowerCase()) : null}
          />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={Camera} loading={photoBusy} onClick={() => fileInputRef.current?.click()}>
              {photoPreview ? 'Change photo' : 'Add a photo'}
            </Button>
            {photoPreview && (
              <Button variant="ghost" size="sm" icon={Trash2} onClick={handleRemovePhoto}>Remove</Button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" tabIndex={-1} />
        </div>

        <div className="mt-6 w-full">
          <Input
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sam"
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            autoFocus
          />
        </div>

        <Button type="submit" size="lg" block className="mt-6" disabled={!trimmed}>Continue</Button>

        <p className="mt-6 text-center text-sm text-ink-faint">
          No sign-up needed. Your name and photo stay on this device and in the rooms you join.{' '}
          <Link to="/privacy" className="rounded-sm text-ink-muted underline underline-offset-4 hover:text-ink">Privacy</Link>
        </p>
      </form>
    </Screen>
  );
}
