/**
 * Service xử lý upload file trực tiếp lên Google Drive thông qua API (REST)
 * Sử dụng quota của chính người dùng (AccessToken)
 */

export const uploadToDriveClient = async (
    file: File,
    accessToken: string,
    parentId?: string
): Promise<{ id: string; webViewLink: string }> => {

    // 1. Khởi tạo Metadata
    const metadata = {
        name: file.name,
        parents: parentId ? [parentId] : []
    };

    // 2. Tạo form data theo chuẩn Google Drive API (Multipart Upload)
    const form = new FormData();
    form.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', file);

    const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            body: form,
        }
    );

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Drive Upload Error Context:', {
            status: response.status,
            error: errorData,
            tokenPrefix: accessToken?.substring(0, 10) + '...'
        });

        let msg = errorData.error?.message || 'Không thể upload lên Google Drive.';
        if (response.status === 401) msg = "Token hết hạn hoặc không hợp lệ. Hãy Đăng xuất và Đăng nhập lại.";
        if (response.status === 403) msg = "Ứng dụng chưa có quyền truy cập Drive hoặc Drive API chưa được bật trong Console.";

        throw new Error(msg);
    }

    const result = await response.json();
    return {
        id: result.id,
        webViewLink: result.webViewLink
    };
};
