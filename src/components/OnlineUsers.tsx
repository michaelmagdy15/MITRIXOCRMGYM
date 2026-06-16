import React, { useMemo, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Users, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow, parseISO, differenceInMinutes } from 'date-fns';

const OnlineUsers: React.FC = () => {
  const { users } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // update every minute
    return () => clearInterval(timer);
  }, []);

  const presenceData = useMemo(() => {
    const allUsers = users.map(user => {
      const isOnline = user.lastSeen 
        ? differenceInMinutes(currentTime, parseISO(user.lastSeen)) < 5 
        : false;
      return { ...user, isOnline };
    });

    const onlineUsers = allUsers.filter(u => u.isOnline);
    const salesTeam = allUsers.filter(u => (u.role === 'rep' || u.role === 'manager' || u.role === 'admin'));
    const onlineSales = salesTeam.filter(u => u.isOnline);

    return {
      totalOnline: onlineUsers.length,
      onlineSales,
      allSales: salesTeam
    };
  }, [users, currentTime]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-800">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
            <Users size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-white">Active Team</h3>
            <p className="text-xs text-zinc-500">{presenceData.totalOnline} user{presenceData.totalOnline !== 1 ? 's' : ''} currently online</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Sales Team Status</h4>
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {presenceData.allSales.map((user) => (
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
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -bottom-1 -right-1 text-sm leading-none select-none"
                        title="Active Now"
                      >
                        🥊
                      </motion.span>
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
                      {user.lastSeen 
                        ? `Last seen ${formatDistanceToNow(parseISO(user.lastSeen))} ago`
                        : 'Never seen'}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default OnlineUsers;
