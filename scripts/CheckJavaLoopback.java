/**
 * scripts/CheckJavaLoopback.java
 *
 * Diagnoses the "Unable to establish loopback connection" failure that blocks every
 * Gradle build on this machine.
 *
 * Run it with a JDK 17+ on PATH:
 *
 *     java scripts/CheckJavaLoopback.java
 *
 * WHAT IT TESTS, in the order Gradle depends on them:
 *
 *   1. Plain TCP loopback        — works on this machine
 *   2. NIO channels over TCP     — works on this machine
 *   3. AF_UNIX bind              — works on this machine
 *   4. AF_UNIX connect           — FAILS: "Invalid argument: connect"
 *   5. Selector.open()           — FAILS, because JDK 17+ on Windows builds the
 *                                  selector's wakeup pipe on an AF_UNIX socket pair
 *
 * Gradle's daemon cannot start without step 5, which is why no Android build can run
 * until AF_UNIX connect works. It is a Windows-level fault, not a Gradle, Expo, JDK or
 * project problem: the `afunix` kernel driver is running and bind succeeds, but connect
 * is rejected.
 *
 * A healthy machine prints "ALL CHECKS PASSED".
 */

import java.net.*;
import java.nio.channels.*;
import java.nio.file.*;

public class CheckJavaLoopback {
  static boolean failed = false;

  static void ok(String s) { System.out.println("  PASS  " + s); }
  static void bad(String s, Throwable e) {
    failed = true;
    System.out.println("  FAIL  " + s + "  ->  " + e);
  }

  public static void main(String[] args) throws Exception {
    System.out.println("java.version = " + System.getProperty("java.version"));
    System.out.println("java.io.tmpdir = " + System.getProperty("java.io.tmpdir"));
    System.out.println();

    // 1. Plain TCP loopback.
    try (ServerSocket ss = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))) {
      try (Socket c = new Socket("127.0.0.1", ss.getLocalPort())) {
        ok("TCP loopback bind + connect");
      }
    } catch (Throwable e) { bad("TCP loopback bind + connect", e); }

    // 2. NIO over TCP.
    try (ServerSocketChannel ss = ServerSocketChannel.open()) {
      ss.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
      int port = ((InetSocketAddress) ss.getLocalAddress()).getPort();
      try (SocketChannel sc = SocketChannel.open(new InetSocketAddress("127.0.0.1", port));
           SocketChannel acc = ss.accept()) {
        ok("NIO channels over TCP loopback");
      }
    } catch (Throwable e) { bad("NIO channels over TCP loopback", e); }

    // 3 and 4. AF_UNIX, which is what actually breaks here.
    Path p = Path.of(System.getProperty("java.io.tmpdir"), "afx-" + System.nanoTime() + ".sock");
    try (ServerSocketChannel ss = ServerSocketChannel.open(StandardProtocolFamily.UNIX)) {
      ss.bind(UnixDomainSocketAddress.of(p));
      ok("AF_UNIX bind");
      try (SocketChannel sc = SocketChannel.open(UnixDomainSocketAddress.of(p))) {
        ok("AF_UNIX connect");
      } catch (Throwable e) {
        bad("AF_UNIX connect  <-- this is the one that blocks Gradle", e);
      }
    } catch (Throwable e) {
      bad("AF_UNIX bind", e);
    } finally {
      try { Files.deleteIfExists(p); } catch (Throwable ignored) { }
    }

    // 5. What Gradle's daemon actually needs.
    try (Selector s = Selector.open()) { ok("Selector.open()  <-- Gradle needs this"); }
    catch (Throwable e) { bad("Selector.open()  <-- Gradle needs this", e); }

    System.out.println();
    System.out.println(failed
        ? "SOME CHECKS FAILED. Gradle cannot start its daemon. See the header of this file."
        : "ALL CHECKS PASSED. Gradle should be able to start.");
  }
}
