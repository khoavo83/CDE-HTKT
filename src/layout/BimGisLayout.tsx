import React from 'react';
import { PageTabsLayout } from './PageTabsLayout';
import { Box, Map } from 'lucide-react';

export const BimGisLayout = () => {
    return (
        <PageTabsLayout
            title="Quản lý BIM - GIS"
            tabs={[
                { name: 'Mô hình BIM 3D', path: '/bim-gis/bim', icon: Box },
                { name: 'Bản đồ Số (GIS)', path: '/bim-gis/map', icon: Map },
            ]}
        />
    );
};
