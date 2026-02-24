use std::net::TcpListener;

/// 查找一个可用端口
pub fn find_available_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("无法绑定端口");
    let port = listener.local_addr().expect("无法获取端口").port();
    drop(listener);
    port
}
