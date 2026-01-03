// components/ContentContainer.jsx
import React from 'react';

const ContentContainer = ({ children }) => {
  return (
    <div className="p-6 bg-gray-900/50 rounded-xl border border-white/10 overflow-x-auto">
      {children}
    </div>
  );
};

export default ContentContainer;