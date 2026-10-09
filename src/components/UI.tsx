import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

export const Button = ({ children, onClick, className = '', variant = 'primary', disabled = false }: any) => {
  const variants: any = {
    primary: 'bg-gold-default text-neutral-black hover:bg-gold-hover active:bg-gold-pressed',
    secondary: 'bg-blue-default text-neutral-black hover:bg-blue-hover active:bg-blue-pressed',
    outline: 'border border-gold-default/40 text-gold-default hover:bg-gold-default/10',
    ghost: 'text-neutral-grey hover:text-neutral-white hover:bg-neutral-white/5',
    danger: 'border border-error-default/50 text-error-default hover:bg-error-default/10',
    success: 'bg-success-default text-neutral-black hover:bg-success-hover active:bg-success-pressed'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Card = ({ children, title, className = '', onClick }: any) => (
  <div 
    onClick={onClick}
    className={`terminal-border bg-neutral-black/60 backdrop-blur-sm p-4 relative overflow-hidden border-neutral-grey/20 ${className}`}
  >
    <div className="absolute top-0 left-0 w-full h-1 bg-gold-default/20" />
    {title && (
      <div className="mb-4 flex items-center gap-2 border-b border-neutral-grey/10 pb-2">
        <ChevronRight size={16} className="text-gold-default/40" />
        <h3 className="text-sm font-bold tracking-widest uppercase text-gold-default opacity-80">{title}</h3>
      </div>
    )}
    {children}
  </div>
);

export const Badge = ({ children, color = 'gold' }: any) => {
  const colors: any = {
    gold: 'border-gold-default/20 text-gold-default bg-gold-default/5',
    blue: 'border-blue-default/20 text-blue-default bg-blue-default/5',
    success: 'border-success-default/20 text-success-default bg-success-default/5',
    error: 'border-error-default/20 text-error-default bg-error-default/5',
    attention: 'border-attention-default/20 text-attention-default bg-attention-default/5',
    white: 'border-neutral-white/20 text-neutral-white bg-neutral-white/5'
  };

  return (
    <span className={`text-[10px] px-2 py-0.5 border ${colors[color] || colors.white} uppercase tracking-tighter`}>
      {children}
    </span>
  );
};

export const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <Card title={title}>
          <p className="text-sm text-neutral-grey mb-8">{message}</p>
          <div className="flex justify-end gap-4">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button variant="danger" onClick={onConfirm}>Confirm Action</Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};
