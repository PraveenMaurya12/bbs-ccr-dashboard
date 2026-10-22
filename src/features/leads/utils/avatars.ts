import avatar1 from '@/assets/avatars/avatar-01.png'
import avatar2 from '@/assets/avatars/avatar-02.png'
import avatar3 from '@/assets/avatars/avatar-03.png'
import avatar4 from '@/assets/avatars/avatar-04.png'
import avatar5 from '@/assets/avatars/avatar-05.png'
import avatar6 from '@/assets/avatars/avatar-06.png'
import avatar7 from '@/assets/avatars/avatar-07.png'
import avatar8 from '@/assets/avatars/avatar-08.png'
import avatar9 from '@/assets/avatars/avatar-09.png'
import { AVATAR_BG_CLASSES } from './leadDisplay'

const AVATAR_IMAGES = [avatar1, avatar2, avatar3, avatar4, avatar5, avatar6, avatar7, avatar8, avatar9]

function wrapIndex(avatarIndex: number, length: number): number {
  return (((avatarIndex - 1) % length) + length) % length
}

export function avatarImageFor(avatarIndex: number): string {
  return AVATAR_IMAGES[wrapIndex(avatarIndex, AVATAR_IMAGES.length)]!
}

export function avatarBgClassFor(avatarIndex: number): string {
  return AVATAR_BG_CLASSES[wrapIndex(avatarIndex, AVATAR_BG_CLASSES.length)]!
}
