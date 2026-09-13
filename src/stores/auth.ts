import { defineStore } from 'pinia'
import {
  deleteAccount,
  fetchMe,
  postLogin,
  postLogout,
  postRegister,
  putChangePassword,
  setUnauthorizedHandler,
  type AuthUser,
} from '../api/client'
import { applyTheme } from '../lib/theme'
import { useCatalogStore } from './catalog'
import { useProgressStore } from './progress'

export type AuthStatus = 'unknown' | 'guest' | 'authed'

function wipeAppStores() {
  useCatalogStore().$reset()
  useProgressStore().$reset()
  applyTheme('dark')
}

export const useAuthStore = defineStore('auth', {
  state: (): {
    user: AuthUser | null
    status: AuthStatus
    busy: boolean
    error: string | null
  } => ({
    user: null,
    status: 'unknown',
    busy: false,
    error: null,
  }),
  actions: {
    bindUnauthorized() {
      setUnauthorizedHandler(() => {
        if (this.status === 'authed') {
          this.user = null
          this.status = 'guest'
          wipeAppStores()
        }
      })
    },
    async init() {
      this.bindUnauthorized()
      try {
        const { user } = await fetchMe()
        this.user = user
        this.status = user ? 'authed' : 'guest'
        this.error = null
      } catch (e) {
        this.user = null
        this.status = 'guest'
        this.error = e instanceof Error ? e.message : String(e)
      }
    },
    async login(email: string, password: string) {
      this.busy = true
      this.error = null
      try {
        const { user } = await postLogin({ email, password })
        this.user = user
        this.status = 'authed'
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.busy = false
      }
    },
    async register(email: string, password: string, displayName?: string) {
      this.busy = true
      this.error = null
      try {
        const { user } = await postRegister({ email, password, displayName })
        this.user = user
        this.status = 'authed'
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.busy = false
      }
    },
    async logout(allDevices = false) {
      this.busy = true
      this.error = null
      try {
        await postLogout(allDevices)
      } catch {
        /* сессия уже могла истечь */
      } finally {
        this.user = null
        this.status = 'guest'
        wipeAppStores()
        this.busy = false
      }
    },
    async changePassword(currentPassword: string, newPassword: string) {
      this.busy = true
      this.error = null
      try {
        await putChangePassword(currentPassword, newPassword)
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.busy = false
      }
    },
    async deleteAccount(password: string) {
      this.busy = true
      this.error = null
      try {
        await deleteAccount(password)
        this.user = null
        this.status = 'guest'
        wipeAppStores()
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.busy = false
      }
    },
    patchUser(partial: Partial<AuthUser>) {
      if (this.user) this.user = { ...this.user, ...partial }
    },
  },
})
