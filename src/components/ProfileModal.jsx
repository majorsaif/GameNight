import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { MAX_NAME_LENGTH } from '../lib/profiles';
import {
  compressProfilePhotoFile,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_UPLOAD_BYTES
} from '../utils/photoCompression';
import { Avatar, Button, Input, Sheet } from '../ui';

export default function ProfileModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user, updateProfile, logout } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [nameInput, setNameInput] = useState(user?.displayName || '');
  const [photoBusy, setPhotoBusy] = useState(false);

  // Sync the name field whenever the sheet opens or the name changes elsewhere
  useEffect(() => {
    if (isOpen) setNameInput(user?.displayName || '');
  }, [isOpen, user?.displayName]);

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/onboarding');
  };

  const trimmed = nameInput.trim();
  const nameChanged = Boolean(trimmed) && trimmed !== (user?.displayName || '');

  const handleNameSave = (e) => {
    e.preventDefault();
    if (!nameChanged) return;
    updateProfile({ displayName: trimmed });
    toast.success('Name updated');
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > PROFILE_PHOTO_MAX_UPLOAD_BYTES) {
      toast.error('That photo is too big. Pick one under 15MB.');
      return;
    }

    setPhotoBusy(true);
    try {
      const { dataUrl } = await compressProfilePhotoFile(file, {
        maxBytes: PROFILE_PHOTO_MAX_BYTES
      });

      updateProfile({ photo: dataUrl });
      toast.success('Photo updated. It shows in rooms you join from now on.');
    } catch (error) {
      console.error('Error compressing profile photo:', error);
      toast.error("Couldn't use that photo. Try a different image.");
    } finally {
      setPhotoBusy(false);
    }

    // Clear the input so the same file can be re-selected
    e.target.value = '';
  };

  const handleAvatarRemove = () => {
    updateProfile({ photo: null });
    toast.success('Photo removed');
  };

  return (
    <Sheet open={isOpen} onClose={onClose} title="Your profile">
      <div className="flex flex-col items-center gap-3 pt-2">
        <Avatar size="2xl" player={user || undefined} name={user?.displayName || '?'} photo={user?.photo} />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={Camera} loading={photoBusy} onClick={() => fileInputRef.current?.click()}>
            {user?.photo ? 'Change photo' : 'Add a photo'}
          </Button>
          {user?.photo && (
            <Button variant="ghost" size="sm" icon={Trash2} onClick={handleAvatarRemove}>Remove</Button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" tabIndex={-1} />
      </div>

      <form onSubmit={handleNameSave} className="mt-6 flex items-end gap-3">
        <Input
          label="Your name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          enterKeyHint="done"
        />
        <Button type="submit" variant="secondary" disabled={!nameChanged}>Save</Button>
      </form>

      <div className="mt-6 border-t border-line pt-6">
        <Button variant="danger-quiet" block icon={LogOut} onClick={handleLogout}>Log out</Button>
        <p className="mt-3 text-center text-sm text-ink-faint">
          Logging out clears your name and photo from this device.{' '}
          <Link to="/privacy" className="rounded-sm text-ink-muted underline underline-offset-4 hover:text-ink">Privacy</Link>
        </p>
      </div>
    </Sheet>
  );
}
