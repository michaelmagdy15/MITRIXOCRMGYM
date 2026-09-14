import React, { useMemo, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Circle, Smartphone, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow, parseISO, differenceInMinutes } from 'date-fns';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

interface MemberPresence {
  id: string;
  clientId: string;
  memberName: string;
  memberId?: string;
  phone?: string;
  status?: string;
  online?: boolean;
  lastSeen?: string;
  appSurface?: string;
}

const parseDate = (value?: string) => {
  if (!value) return null;
  try {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const OnlineUsers: React.FC = () => {
  const { users } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [memberPresence, setMemberPresence] = useState<MemberPresence[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'memberPresence'), orderBy('lastSeen', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMemberPresence(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MemberPresence)));
    }, (err) => {
      console.error('[OnlineUsers] Error loading member presence:', err);
    });
    return () => unsubscribe();
  }, []);

  const presenceData = useMemo(() => {
    const allUsers = users.map(user => {
      const lastSeen = parseDate(user.lastSeen);
      const isOnline = lastSeen ? differenceInMinutes(currentTime, lastSeen) < 5 : false;
      return { ...user, isOnline };
    });

    const onlineUsers = allUsers.filter(u => u.isOnline);
    const salesTeam = allUsers.filter(u => (u.role === 'rep' || u.role === 'manager' || u.role === 'admin'));

    const liveMembers = memberPresence
      .map(member => {
        const lastSeen = parseDate(member.lastSeen);
        const isOnline = Boolean(member.online) && Boolean(lastSeen) && differenceInMinutes(currentTime, lastSeen!) < 3;
        return { ...member, isOnline, lastSeenDate: lastSeen };
      })
      .filter(member => member.isOnline);

    return {
      totalOnline: onlineUsers.length,
      allSales: salesTeam,
      liveMembers,
    };
  }, [users, memberPresence, currentTime]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-800">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
            <Users size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-white">Live Activity</h3>
            <p className="text-xs text-zinc-500">
              {presenceData.totalOnline} staff · {presenceData.liveMembers.length} member{presenceData.liveMembers.length !== 1 ? 's' : ''} in app
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Live Members</h4>
          {presenceData.liveMembers.length === 0 ? (
            <div className="text-xs text-zinc-500 border border-dashed rounded-xl p-4 text-center">
              No members are active in the app right now.
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {presenceData.liveMembers.slice(0, 8).map(member => (
                  <motion.div
                    key={member.clientId}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <Smartphone className="h-4 w-4" />
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-900" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                          {member.memberName || 'Member'}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {member.memberId ? `#${member.memberId}` : member.phone || 'Member app'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                      Live
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Sales Team Status</h4>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {presenceData.allSales.map((user) => {
                const lastSeen = parseDate(user.lastSeen);
                return (
                  <motion.div
                    key={user.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 font-medium border border-zinc-200 dark:border-zinc-700">
                          {user.name.charAt(0)}
                        </div>
                        {user.isOnline && (
                          <Circle className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 fill-emerald-500 text-emerald-500 stroke-white dark:stroke-zinc-900" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors">
                          {user.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 capitalize">{user.role.replace('_', ' ')}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      {user.isOnline ? (
                        <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                          Active Now
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-400">
                          {lastSeen ? `Last seen ${formatDistanceToNow(lastSeen)} ago` : 'Never seen'}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnlineUsers;
